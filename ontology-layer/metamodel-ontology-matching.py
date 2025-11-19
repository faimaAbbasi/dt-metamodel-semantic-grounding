from rdflib import Graph, URIRef, RDFS, RDF, OWL, Literal, BNode, Namespace
from typing import List, Tuple, Set, Dict
import numpy as np
import os
import json
from collections import defaultdict
from typing import Set, Dict, List, Tuple
import numpy as np
import jellyfish 
from sentence_transformers import SentenceTransformer
from scipy.spatial.distance import cosine
import xml.etree.ElementTree as ET
import subprocess
import re
import json
import csv
from typing import List, Dict

LLM_MODEL = "llama3"  
TARGET_ONTOLOGY_PATH = "brick.ttl"
HOPS_FOR_CONTEXT = 7

# ------------------ UTILITIES ------------------

def normalize_uri(uri: str) -> str:
    return uri.strip().strip('<>').rstrip('/')

def is_uri(value: str) -> bool:
    return bool(re.match(r'^(http|https|ftp|urn):', value))

def add_triple_safe(graph: Graph, s: str, p: str, o: str):
    if not is_uri(s) or not is_uri(p):
        return
    s_ref = URIRef(s)
    p_ref = URIRef(p)
    o_ref = URIRef(o) if is_uri(o) else Literal(o.strip() if isinstance(o, str) else o)
    graph.add((s_ref, p_ref, o_ref))

def extract_all_triples(graph: Graph) -> List[Tuple[str, str, str]]:
    return [(str(s), str(p), str(o)) for s, p, o in graph if not isinstance(s, BNode) and not isinstance(o, BNode)]

def extract_local_name(uri: str) -> str:
    """
    Extract local name from URI (after last # or /)
    """
    if '#' in uri:
        return uri.split('#')[-1]
    else:
        return uri.split('/')[-1]
    
def split_camel_case(text: str) -> str:
    return re.sub(r'(?<=[a-z])(?=[A-Z])', ' ', text)

# ------------------ KNOWLEDGE GRAPH ------------------


def extract_classes(graph: Graph) -> set[str]:
    classes = set()
    for c in graph.subjects(RDF.type, OWL.Class):
        if isinstance(c, URIRef):
            classes.add(str(c))
    for c in graph.subjects(RDF.type, RDFS.Class):
        if isinstance(c, URIRef):
            classes.add(str(c))
    return classes

def extract_subclass_triples(graph: Graph) -> List[Tuple[str, str, str]]:
    triples = []
    for subclass, _, superclass in graph.triples((None, RDFS.subClassOf, None)):
        if isinstance(subclass, URIRef) and isinstance(superclass, URIRef):
            triples.append((str(subclass), str(RDFS.subClassOf), str(superclass)))
    return triples

def extract_properties(graph: Graph) -> Set[str]:
    props = set()
    for p in graph.subjects(RDF.type, OWL.ObjectProperty):
        if isinstance(p, URIRef):
            props.add(str(p))
    for p in graph.subjects(RDF.type, OWL.DatatypeProperty):
        if isinstance(p, URIRef):
            props.add(str(p))
    return props

def extract_property_triples(graph: Graph, properties: Set[str]) -> List[Tuple[str, str, str]]:
    triples = []
    for prop_uri in properties:
        prop = URIRef(prop_uri)
        for domain in graph.objects(prop, RDFS.domain):
            if isinstance(domain, URIRef):
                triples.append((prop_uri, str(RDFS.domain), str(domain)))
        for rng in graph.objects(prop, RDFS.range):
            if isinstance(rng, URIRef):
                triples.append((prop_uri, str(RDFS.range), str(rng)))
        triples.append((prop_uri, str(RDF.type), str(OWL.ObjectProperty) if (prop_uri in properties) else str(OWL.DatatypeProperty)))
    return triples

def extract_relationship_triples(graph: Graph, properties: Set[str]) -> List[Tuple[str, str, str]]:
    triples = []
    for prop_uri in properties:
        prop = URIRef(prop_uri)
        for s, o in graph.subject_objects(prop):
            if isinstance(s, URIRef) and isinstance(o, URIRef):
                triples.append((str(s), prop_uri, str(o)))
    return triples

def generate_ontology_graph_and_triples(ontology_path: str) -> Tuple[Graph, List[Tuple[str, str, str]]]:
    g = Graph()
    g.parse(ontology_path, format='turtle')
    classes = extract_classes(g)
    """ missing_classes = known_classes - classes
    if missing_classes:
        print(f"[Warning] Missing classes in ontology {ontology_path}: {missing_classes}") """
    subclass_triples = extract_subclass_triples(g)
    properties = extract_properties(g)
    domain_range_triples = extract_property_triples(g, properties)
    relationship_triples = extract_relationship_triples(g, properties)
    clean_graph = Graph()
    for cls in classes:
        clean_graph.add((URIRef(cls), RDF.type, OWL.Class))
    for s, p, o in subclass_triples:
        add_triple_safe(clean_graph, s, p, o)
    for s, p, o in domain_range_triples:
        add_triple_safe(clean_graph, s, p, o)
    for s, p, o in relationship_triples:
        add_triple_safe(clean_graph, s, p, o)
    triples = extract_all_triples(clean_graph)
    
    return clean_graph, triples

def generate_knowledge_graph_from_metamodel(source_model_json) -> Tuple[Graph, List[Tuple[str, str, str]]]:
    BASE = Namespace("http://metamodel#")
    g = Graph()
    g.bind("meta", BASE)

    for cls in source_model_json:
        class_uri = BASE[cls["name"]]
        g.add((class_uri, RDF.type, RDFS.Class))
        g.add((class_uri, RDFS.label, Literal(cls["name"])))
        g.add((class_uri, RDFS.comment, Literal(cls["description"])))

        for attr in cls.get("primitive_attributes", []):
            if ":" in attr:
                attr_name, attr_type = map(str.strip, attr.split(":"))
                prop_uri = BASE[f"{cls['name']}_{attr_name}"]
                g.add((prop_uri, RDF.type, RDF.Property))
                g.add((prop_uri, RDFS.domain, class_uri))
                g.add((prop_uri, RDFS.range, Literal(attr_type)))

        for ref in cls.get("reference_attributes", []):
            if ":" in ref:
                ref_name, ref_type_raw = map(str.strip, ref.split(":"))
                ref_type = ref_type_raw.replace("[]", "")
                prop_uri = BASE[f"{cls['name']}_{ref_name}"]
                target_uri = BASE[ref_type]
                g.add((prop_uri, RDF.type, RDF.Property))
                g.add((prop_uri, RDFS.domain, class_uri))
                g.add((prop_uri, RDFS.range, target_uri))

    triples = [(str(s), str(p), str(o)) for s, p, o in g]
    return g, triples

# ------------------ EXTRACT CONTEXT ------------------


def enrich_context_with_graph_walk(graph: Graph, class_uri: str, hops: int = 2) -> List[str]:
    """
    Walk the RDF graph to collect context from related nodes and their labels.
    """
    context = set()
    frontier = {URIRef(class_uri)}
    seen = set()

    for _ in range(hops):
        next_frontier = set()
        for node in frontier:
            if node in seen:
                continue
            seen.add(node)

            for _, predicate, obj in graph.triples((node, None, None)):
                if isinstance(obj, URIRef):
                    # Get label for target node
                    label = get_best_label(graph, obj)
                    context.add(f"{extract_local_name(str(predicate))}: {label}")
                    next_frontier.add(obj)

        frontier = next_frontier

    return list(context)

def extract_class_contexts(graph: Graph, hops: int = 2) -> Dict[str, str]:
    """
    Generate a context dictionary for each class using labels and local graph structure.
    """
    class_contexts = {}
    for s in graph.subjects(RDF.type, OWL.Class):
        if isinstance(s, BNode):
            continue

        uri_str = str(s)
        label = get_best_label(graph, s)
        related_context = enrich_context_with_graph_walk(graph, uri_str, hops=hops)

        combined_context = [f"label: {label}"] + related_context
        class_contexts[uri_str] = "\n".join(combined_context)

    return class_contexts

def extract_class_contexts_metamodel(graph: Graph) -> Dict[str, str]:
    class_contexts = {}
    for s in graph.subjects(RDF.type, RDFS.Class):  
        if isinstance(s, BNode):
            continue
        label = graph.value(subject=s, predicate=RDFS.label)
        label_text = str(label) if label else str(s).split("#")[-1]
        extra_context = enrich_context_with_graph_walk(graph, str(s), hops=HOPS_FOR_CONTEXT)
        context = [label_text] + extra_context
        class_contexts[str(s)] = "\n".join(context)
    return class_contexts

#  ------------------ EMBEDDINGS & TOP-K ------------------


def extract_local_name(uri: str) -> str:
    """
    Extract local name from URI (after last '#' or '/').
    """
    if '#' in uri:
        return uri.rsplit('#', 1)[-1]
    else:
        return uri.rstrip('/').rsplit('/', 1)[-1]

def extract_classes(graph: Graph) -> Set[str]:
    """
    Return a set of all class URIs (as strings) in the graph,
    i.e. everything typed rdf:type owl:Class or rdf:type rdfs:Class.
    """
    classes = set()
    for c in graph.subjects(RDF.type, OWL.Class):
        if isinstance(c, URIRef):
            classes.add(str(c))
    for c in graph.subjects(RDF.type, RDFS.Class):
        if isinstance(c, URIRef):
            classes.add(str(c))
    return classes

def get_label_or_local(graph: Graph, cls_ref: URIRef) -> str:
    """
    Prefer rdfs:label if present; otherwise fallback to local name.
    Underscores → spaces, lowercased.
    """
    label_node = graph.value(cls_ref, RDFS.label)
    if isinstance(label_node, Literal):
        text = str(label_node)
    else:
        text = extract_local_name(str(cls_ref)).replace('_', ' ')
    return text.lower().strip()

def get_best_label(graph: Graph, cls_ref: URIRef) -> str:
    """
    Try to extract meaningful label from common predicates; fallback to local name.
    """
    label_predicates = [
        RDFS.label,
        URIRef("http://www.w3.org/2004/02/skos/core#prefLabel"),
        URIRef("http://www.geneontology.org/formats/oboInOwl#hasExactSynonym")
    ]
    for pred in label_predicates:
        label = graph.value(cls_ref, pred)
        if isinstance(label, Literal):
            return str(label).strip().lower()

    # Fallback: local name
    return extract_local_name(str(cls_ref)).replace("_", " ").replace("-", " ").lower()

def extract_tokens_from_uri(uri: str) -> str:
    local = extract_local_name(uri)
    spaced = re.sub(r'[_\-]', ' ', local)
    return split_camel_case(spaced).lower()

def build_rich_text_and_props(graph: Graph, uri: str) -> Tuple[str, Set[str]]:
    """
    Enriched fallback for sparse ontologies. If no labels/comments, uses URI tokenization.
    """
    cls_ref = URIRef(uri)

    label_text = get_best_label(graph, cls_ref)

    comment_node = graph.value(cls_ref, RDFS.comment)
    comment_text = str(comment_node).strip().lower() if isinstance(comment_node, Literal) else ""

    # Superclasses
    supers = []
    for sup in graph.objects(cls_ref, RDFS.subClassOf):
        if isinstance(sup, URIRef):
            supers.append(get_best_label(graph, sup))
    super_text = " subclasses: " + ", ".join(supers) if supers else ""

    # Properties
    prop_texts = []
    prop_set = set()
    for prop in graph.subjects(RDFS.domain, cls_ref):
        prop_label = get_best_label(graph, prop)
        prop_set.add(prop_label)
        range_val = graph.value(prop, RDFS.range)
        if isinstance(range_val, URIRef):
            range_name = get_best_label(graph, range_val)
            prop_texts.append(f"{prop_label}: {range_name}")
        else:
            prop_texts.append(prop_label)
    attrs_text = ". attributes: " + ", ".join(prop_texts) if prop_texts else ""

    # Fallback: if everything is still sparse
    if not label_text or label_text.isnumeric():
        label_text = extract_tokens_from_uri(uri)
    if not comment_text and not super_text and not attrs_text:
        comment_text = f"related to {label_text}"

    rich_doc = " ".join([label_text, comment_text, super_text, attrs_text]).strip()
    return rich_doc, prop_set


def generate_embeddings_and_props(
    graph: Graph,
    entities: Set[str],
    model_name: str = 'BAAI/bge-large-en-v1.5'
) -> Tuple[Dict[str, np.ndarray], Dict[str, np.ndarray], Dict[str, Set[str]]]:
    """
    For each class URI:
      - label_embs: embedding of human-readable label (from rdfs:label if available)
      - rich_embs: embedding of enriched context including label, comments, superclasses, and properties
      - prop_sets: set of property labels

    Returns three dictionaries.
    """
    model = SentenceTransformer(model_name)
    classes_in_graph = extract_classes(graph)

    uris_list: List[str] = []
    label_texts: List[str] = []
    rich_texts: List[str] = []
    prop_sets: Dict[str, Set[str]] = {}

    for uri in entities:
        uris_list.append(uri)
        cls_ref = URIRef(uri)

        # ----------------- 1. Label Text -----------------
        label_node = graph.value(cls_ref, RDFS.label)
        if isinstance(label_node, Literal):
            label_only = str(label_node).strip().lower()
        else:
            label_only = extract_local_name(uri).replace("_", " ").replace("-", " ").lower()

        label_texts.append(f"{cls_ref}: {label_only}")

        # ----------------- 2. Rich Text -----------------
        if uri in classes_in_graph:
            rich_doc, props = build_rich_text_and_props(graph, uri)
            # Always prepend human-readable label at the beginning
            rich_texts.append(f"{cls_ref}:{label_only}: {rich_doc}")
            prop_sets[uri] = props
        else:
            # Non-class fallback
            rich_texts.append(label_only)
            prop_sets[uri] = set()

    # ----------------- 3. Embedding -----------------
    label_embeddings = model.encode(label_texts, normalize_embeddings=True)
    rich_embeddings  = model.encode(rich_texts, normalize_embeddings=True)

    # ----------------- 4. Return Dicts -----------------
    label_embs = {uri: emb for uri, emb in zip(uris_list, label_embeddings)}
    rich_embs  = {uri: emb for uri, emb in zip(uris_list, rich_embeddings)}

    return label_embs, rich_embs, prop_sets


def combined_similarity(
    uri1: str,
    uri2: str,
    label_embs1: Dict[str, np.ndarray],
    rich_embs1: Dict[str, np.ndarray],
    props1: Dict[str, Set[str]],
    label_embs2: Dict[str, np.ndarray],
    rich_embs2: Dict[str, np.ndarray],
    props2: Dict[str, Set[str]],
    alpha: float = 0.7,
    beta: float = 0.6,
    jw_threshold: float = 0.8
) -> float:
    """
    Compute final similarity between two URIs via:
      1. emb_label1, emb_rich1  = embeddings for uri1
         emb_label2, emb_rich2  = embeddings for uri2
      2. combined_embed_score = cos( alpha·emb_label + (1-alpha)·emb_rich , same for uri2 )
      3. lexical Jaro-Winkler on their local names: if > jw_threshold, bump to 0.95
      4. graph Jaccard over property sets:
          jaccard = |props1 ∩ props2| / |props1 ∪ props2|  (0 if both empty)
      5. final = beta·combined_embed_score + (1 - beta)·jaccard
    """
    # 1. Combine embeddings
    emb1 = alpha * label_embs1[uri1] + (1 - alpha) * rich_embs1[uri1]
    emb2 = alpha * label_embs2[uri2] + (1 - alpha) * rich_embs2[uri2]
    emb_score = 1 - cosine(emb1, emb2)  # cosine similarity

    # 2. Lexical boost if labels nearly identical
    l1 = extract_local_name(uri1).replace('_', ' ').lower()
    l2 = extract_local_name(uri2).replace('_', ' ').lower()
    jw = jellyfish.jaro_winkler_similarity(l1, l2)
    if jw > jw_threshold:
        emb_score = max(emb_score, 0.95)

    # 3. Jaccard on property sets
    p1 = props1.get(uri1, set())
    p2 = props2.get(uri2, set())
    if p1 or p2:
        jaccard = len(p1 & p2) / len(p1 | p2)
    else:
        jaccard = 0.0

    # 4. Final combined
    return beta * emb_score + (1 - beta) * jaccard

# ------------------ LLM MAPPING ------------------


def call_llama3_ollama(prompt: str) -> str:
    result = subprocess.run(
        ["ollama", "run", LLM_MODEL],
        input=prompt.encode("utf-8"),
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    return result.stdout.decode("utf-8")

def fallback_parse_natural_response(response: str) -> List[Dict]:
    try:
        source_matches = re.findall(r'source class [`"]?(http[^`\n"]+)[`"]?', response)
        target_matches = re.findall(r'target class [`"]?(http[^`\n"]+)[`"]?', response)
        relation_matches = re.findall(r'relationship .*?["\'](equivalent|more general|less general|related|disjoint)["\']', response, re.IGNORECASE)
        score_matches = re.findall(r'score.*?([0-9.]+)', response)
        justification_matches = re.findall(r'justification.*?:\s*(.*?)(?:\n|$)', response, re.IGNORECASE | re.DOTALL)

        length = min(len(source_matches), len(target_matches), len(relation_matches), len(score_matches))
        if length == 0:
            return []

        mappings = []
        for i in range(length):
            justification = justification_matches[i].strip() if i < len(justification_matches) else "No justification provided."
            mappings.append({
                "source_class_uri": source_matches[i].strip(),
                "target_class_uri": target_matches[i].strip(),
                "relation": relation_matches[i].lower(),
                "score": float(score_matches[i]),
                "justification": justification
            })

        best_mapping = max(mappings, key=lambda x: x["score"])
        return [best_mapping]

    except Exception:
        return []

def run_llm_alignment_with_ollama(source_contexts, target_contexts, top_matches, top_k, path='metamodel-ontology-mappings.csv'):
    all_mappings = []
    csv_rows = []

    for s_uri, top3 in top_matches.items():
        print("\n Source URI:", "-", s_uri)
        source_ctx = source_contexts[s_uri]

        prompt = f"""
    You are an expert in ontology alignment.

    Analyze the following source class and its candidate target class matches based on both:
    - Numerical similarity score
    - Semantic fit between contexts

    ---
                
    Source Class URI: {s_uri}
    Source Context:
    {source_ctx}

    TOP {top_k} CANDIDATE MATCHES:
    """
        for t_uri, sim in top3:
            target_ctx = target_contexts.get(t_uri, "")
            prompt += f"\n TARGET CLASS URI: {t_uri} (NUMERICAL SIMILARITY SCORE: {sim:.4f})\nTARGET CLASS CONTEXT:\n{target_ctx}\n"

        prompt += """
    ---

    TASK:

    - Select the **best semantic match** for the source class based on **both numerical similarity** and **contextual meaning**.
    - You MAY choose a class with a slightly lower similarity score if it is semantically more appropriate.
    - Then classify the semantic relationship between the source and selected target class as one of:
        "equivalent", "more general", "less general", "related", "disjoint"


    RESPONSE FORMAT:
        Return ONLY a JSON array with a single object in this format:


    [
    {
        "source_class_uri": "http://...",
        "target_class_uri": "http://...",
        "relation": "equivalent" or "more general" or "less general" or "related" or "disjoint",
        "score": 0.54,
        "justification": "The source and target context ..."
    }
    ]
    """

        response = call_llama3_ollama(prompt)

        try:
            json_match = re.search(r'\[\s*{.*?}\s*\]', response, re.DOTALL)
            if not json_match:
                json_match = re.search(r'{.*}', response, re.DOTALL)

            if json_match:
                json_str = json_match.group(0)
                if json_str.startswith('{') and not json_str.startswith('['):
                    json_str = f'[{json_str}]'

                parsed_raw = json.loads(json_str)

                # Normalize keys and ensure justification exists
                normalized = []
                for item in parsed_raw:
                    item = {k.lower(): v for k, v in item.items()}
                    normalized.append({
                        "source_class_uri": item.get("source_class_uri", ""),
                        "target_class_uri": item.get("target_class_uri", ""),
                        "relation": item.get("relation", "").lower(),
                        "score": float(item.get("score", 0)),
                        "justification": item.get("justification", "No justification provided.")
                    })

                best_mapping = max(normalized, key=lambda x: x["score"])
                parsed = [best_mapping]

                all_mappings.extend(parsed)
                for row in parsed:
                    csv_rows.append([
                        row["source_class_uri"],
                        row["target_class_uri"],
                        row["relation"],
                        row["score"],
                        row["justification"]
                    ])
            else:
                raise ValueError("No JSON found in response.")

        except Exception as e:
            fallback = fallback_parse_natural_response(response)
            if fallback:
                parsed = fallback
                all_mappings.extend(parsed)
                for row in parsed:
                    csv_rows.append([
                        row["source_class_uri"],
                        row["target_class_uri"],
                        row["relation"],
                        row["score"],
                        row["justification"]
                    ])
                print("Mapping Parsed with fallback:", parsed)
            else:
                parsed = {"error": "Failed to parse", "raw": response, "exception": str(e)}
                print("Mapping Parse Error:", parsed)
                continue

        print("\nMapping Parsed:", parsed)
    
    # Construct the path to the output folder relative to this script
    csv_path = os.path.join(os.path.dirname(__file__), '..', 'output', path)

    # Ensure the output directory exists (optional, but good practice)
    os.makedirs(os.path.dirname(csv_path), exist_ok=True)

    with open(csv_path, 'w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        writer.writerow(["source_class_uri", "target_class_uri", "semantic_relation", "similarity_score", "justification"])
        for row in csv_rows:
            writer.writerow(row)

    print(f"\n LLM alignment results saved to {'output',path}")
    return all_mappings

# ------------------ MAIN ------------------

def main():
    
    with open('../output/metamodel.json', 'r', encoding='utf-8') as f:
         source_model_json = json.load(f)
    
    print("\n1. Loading metamodel...")
    source_graph, source_ttl = generate_knowledge_graph_from_metamodel(source_model_json)
    print(f" Metamodel triples count: {len(source_ttl)}")
    
    print("\n2. Processing target ontology...")
    target_graph, target_ttl = generate_ontology_graph_and_triples(TARGET_ONTOLOGY_PATH)
    print(f" Target ontology triples count: {len(target_ttl)}")
    
    # 3. Extract class URI sets
    source_classes = extract_classes(source_graph)
    target_classes = extract_classes(target_graph)
    
     # 4. Generate embeddings + property sets for source and target
    label_src, rich_src, props_src = generate_embeddings_and_props(source_graph, source_classes)
    label_tgt, rich_tgt, props_tgt = generate_embeddings_and_props(target_graph, target_classes)

    # 5. Compute pairwise similarities and pick top matches (or threshold + one-to-one)
    results: Dict[str, List[Tuple[str, float]]] = {}
    for s in source_classes:
        sims: List[Tuple[str, float]] = []
        for t in target_classes:
            score = combined_similarity(
                s, t,
                label_src, rich_src, props_src,
                label_tgt, rich_tgt, props_tgt,
                alpha=0.5,       # weight for label vs rich
                beta=0.6,        # weight for embedding vs jaccard
                jw_threshold=0.9
            )
            sims.append((t, score))
        sims.sort(key=lambda x: x[1], reverse=True)
        results[s] = sims[:3]  
        
    print("\n3. Top-k Embeddings")
    for s_uri, top3 in results.items():
            print(f"Source class URI: {s_uri}")
            for t_uri, sim in top3:
                print(f"  Target class URI: {t_uri}  |  Similarity: {sim:.4f}")
            print()
             
    source_contexts = extract_class_contexts_metamodel(source_graph)
    target_contexts = extract_class_contexts(target_graph)
    top_k=3
    
    print("\n4. LLM Alignment...")
    mappings=run_llm_alignment_with_ollama(source_contexts, target_contexts, results, top_k)

if __name__ == "__main__":
    main()
