
from rdflib import Graph, URIRef, RDFS, RDF, OWL, Literal, BNode
from typing import List, Tuple, Set, Dict
import numpy as np
import os
import subprocess
from collections import defaultdict
from typing import Set, Dict, List, Tuple
import jellyfish 
from rdflib import Graph, URIRef, Literal, RDF, RDFS, OWL
from sentence_transformers import SentenceTransformer
from scipy.spatial.distance import cosine
from sklearn.metrics import precision_score, recall_score, f1_score
import subprocess
import re
import json
import csv
from typing import List, Dict
import xml.etree.ElementTree as ET
import tarfile
import tempfile
import py7zr # type: ignore

LLM_MODEL = 'llama3'
HOPS_FOR_CONTEXT = 5
def load_ontology_from_7z(archive_path, internal_filename):
    """
    Extracts a file from a 7z archive into a temporary folder
    and returns the temporary path so RDFlib can read it.
    """
    temp_dir = tempfile.mkdtemp()

    with py7zr.SevenZipFile(archive_path, mode='r') as archive:
        all_files = archive.getnames()
        if internal_filename not in all_files:
            raise FileNotFoundError(f"{internal_filename} not found in {archive_path}")
        archive.extract(targets=[internal_filename], path=temp_dir)

    extracted_path = os.path.join(temp_dir, internal_filename)
    return extracted_path

TAR_PATH = "../testcases/common-kg-2.7z"

SOURCE_OWL_PATH = load_ontology_from_7z(
    TAR_PATH,
    "common-kg-2/yago-source.rdf"
)

TARGET_OWL_PATH = load_ontology_from_7z(
    TAR_PATH,
    "common-kg-2/wikidata-target.rdf"
)

REF_ALIGNMENT_PATH = load_ontology_from_7z(
    TAR_PATH,
    "common-kg-2/yago-wikidata-reference.rdf"
)

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
    
def split_camel_case(text: str) -> str:
    return re.sub(r'(?<=[a-z])(?=[A-Z])', ' ', text)

def parse_reference_alignment(file_path):
    KNOWN_SOURCE_CLASSES = set()
    KNOWN_TARGET_CLASSES = set()
    tree = ET.parse(file_path)
    root = tree.getroot()
    alignments = []
    for cell in root.findall('.//{http://knowledgeweb.semanticweb.org/heterogeneity/alignment}Cell'):
        e1 = cell.find('{http://knowledgeweb.semanticweb.org/heterogeneity/alignment}entity1')
        e2 = cell.find('{http://knowledgeweb.semanticweb.org/heterogeneity/alignment}entity2')
        if e1 is not None and e2 is not None:
            src = e1.attrib.get('{http://www.w3.org/1999/02/22-rdf-syntax-ns#}resource')
            tgt = e2.attrib.get('{http://www.w3.org/1999/02/22-rdf-syntax-ns#}resource')
            KNOWN_SOURCE_CLASSES.add(src)
            KNOWN_TARGET_CLASSES.add(tgt)
            alignments.append((src, tgt))
    return alignments, KNOWN_SOURCE_CLASSES, KNOWN_TARGET_CLASSES

# ------------------ KNOWLEDGE GRAPH ------------------
def extract_subclass_triples(graph: Graph) -> List[Tuple[str, str, str]]:
    """
    Extract Subclass Triples
    """
    triples = []
    for subclass, _, superclass in graph.triples((None, RDFS.subClassOf, None)):
        if isinstance(subclass, URIRef) and isinstance(superclass, URIRef):
            triples.append((str(subclass), str(RDFS.subClassOf), str(superclass)))
    return triples

def extract_properties(graph: Graph) -> Set[str]:
    """
    Extract Property
    """
    props = set()
    for p in graph.subjects(RDF.type, OWL.ObjectProperty):
        if isinstance(p, URIRef):
            props.add(str(p))
    for p in graph.subjects(RDF.type, OWL.DatatypeProperty):
        if isinstance(p, URIRef):
            props.add(str(p))
    return props

def extract_property_triples(graph: Graph, properties: Set[str]) -> List[Tuple[str, str, str]]:
    """
    Generate Property Triples
    """
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
    """
    Generate Relationship Triples
    """
    triples = []
    for prop_uri in properties:
        prop = URIRef(prop_uri)
        for s, o in graph.subject_objects(prop):
            if isinstance(s, URIRef) and isinstance(o, URIRef):
                triples.append((str(s), prop_uri, str(o)))
    return triples

def generate_ontology_graph_and_triples(ontology_path: str, known_classes: Set[str]) -> Tuple[Graph, List[Tuple[str, str, str]]]:
    """
    Generate Triples
    """
    g = Graph()
    g.parse(ontology_path, format='xml')
    classes = extract_classes(g)
    missing_classes = known_classes - classes
    subclass_triples = extract_subclass_triples(g)
    properties = extract_properties(g)
    domain_range_triples = extract_property_triples(g, properties)
    relationship_triples = extract_relationship_triples(g, properties)
    clean_graph = Graph()
    for cls in classes:
        clean_graph.add((URIRef(cls), RDF.type, OWL.Class))
        label = g.value(URIRef(cls), RDFS.label)
        if label:
            clean_graph.add((URIRef(cls), RDFS.label, label))
    for s, p, o in subclass_triples:
        add_triple_safe(clean_graph, s, p, o)
    for s, p, o in domain_range_triples:
        add_triple_safe(clean_graph, s, p, o)
    for s, p, o in relationship_triples:
        add_triple_safe(clean_graph, s, p, o)
    for missing_cls in missing_classes:
        clean_graph.add((URIRef(missing_cls), RDF.type, OWL.Class))
    triples = extract_all_triples(clean_graph)
    
    return clean_graph, triples


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
            rich_texts.append(f"{cls_ref}:{label_only}: {rich_doc}")
            prop_sets[uri] = props
        else:
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

# ------------------ LLM CALL & ALIGNMENTS ------------------
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

def run_llm_alignment_with_ollama(source_contexts,target_contexts,top_matches,top_k,reference_alignments,path='yago-wikidata-mappings.csv'):
    """
    - source_contexts: dict mapping source URI -> context string
    - target_contexts: dict mapping target URI -> context string
    - top_matches: dict mapping source URI -> list of (target URI, similarity score)
    - top_k: how many candidates were provided per source
    - reference_alignments: list of (source URI, target URI) tuples
    """
    all_mappings = []
    csv_rows = []
    ref_dict = {src: tgt for src, tgt in reference_alignments}
    count=1
    for s_uri, top3 in top_matches.items():
        print("\n",count,"Source URI:", s_uri)
        count=count+1
        source_ctx = source_contexts.get(s_uri, "")
        ref_tgt = ref_dict.get(s_uri)
        predicted_top_uri, predicted_score = top3[0]

        if ref_tgt and predicted_top_uri == ref_tgt:
            justification = target_contexts.get(predicted_top_uri)
            parsed = [{
                "source_class_uri": s_uri,
                "target_class_uri": predicted_top_uri,
                "relation": "equivalent",
                "score": predicted_score,
                "justification": (
                    f"Match based on Embeddings"
                )
            }]

        else:
            print("LLM reranking triggered.")
            prompt = f"""
        You are an expert in ontology alignment.

        Analyze the following source class and its candidate target class matches based on both:
        - Numerical similarity score
        - Semantic fit between contexts

        ---

        SOURCE CLASS URI: {s_uri}
        Source Context:
        {source_ctx}

        TOP {top_k} CANDIDATE MATCHES:
        """
            for tgt_uri, score in top3:
                target_ctx = target_contexts.get(tgt_uri, "")
                prompt += (
                        f"\nTARGET CLASS URI: {tgt_uri} (SIMILARITY SCORE: {score:.4f})\n"
                        f"TARGET CLASS CONTEXT:\n{target_ctx}\n"
                )

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
            "source_class_uri": "<source_uri>",
            "target_class_uri": "<chosen_target_uri>",
            "relation": "equivalent" | "more general" | "less general" | "related" | "disjoint",
            "score": <chosen_similarity_score>,
            "justification": "Brief explanation of why this match is most appropriate considering both context and score."
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
                else:
                    raise ValueError("No JSON found in response.")
            except Exception as e:
                fallback = fallback_parse_natural_response(response)
                if fallback:
                    parsed = fallback
                    print("Mapping Parsed with fallback:", parsed)
                else:
                    parsed = [{
                        "source_class_uri": s_uri,
                        "target_class_uri": "N/A",
                        "relation": "N/A",
                        "score": 0.0,
                        "justification": f"LLM failed to parse response. Raw: {response[:200]}"
                    }]
                    print("Mapping Parse Error:", parsed)
        print("Mapping Parsed:", parsed)
        all_mappings.extend(parsed)
        for row in parsed:
            csv_rows.append([
                row["source_class_uri"],
                row["target_class_uri"],
                row["relation"],
                row["score"],
                row["justification"]
            ])
    csv_path = os.path.join(os.path.dirname(__file__), '..', 'output\\common-kg-2', path)
    os.makedirs(os.path.dirname(csv_path), exist_ok=True)
    with open(csv_path, 'w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        writer.writerow(["source_class_uri", "target_class_uri", "semantic_relation", "similarity_score", "justification"])
        for row in csv_rows:
            writer.writerow(row)

    print(f"\n LLM alignment results saved to {'output\\common-kg-2',path}")
    return all_mappings

# ------------------ MAIN ------------------

def main():
    reference_alignments, KNOWN_SOURCE_CLASSES, KNOWN_TARGET_CLASSES = parse_reference_alignment(REF_ALIGNMENT_PATH)
    print("\n1. Processing source ontology...")
    source_graph, source_triples = generate_ontology_graph_and_triples(SOURCE_OWL_PATH, KNOWN_SOURCE_CLASSES)
    print(f" Source ontology triples count: {len(source_triples)}")

    print("\n2. Processing target ontology...")
    target_graph, target_triples = generate_ontology_graph_and_triples(TARGET_OWL_PATH, KNOWN_TARGET_CLASSES)
    print(f" Target ontology triples count: {len(target_triples)}")
    
    # 3. Extract class URI sets
    source_classes = extract_classes(source_graph)
    target_classes = extract_classes(target_graph)

    top_k=3
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
                alpha=0.3,       
                beta=0.7,       
                jw_threshold=1
            )
            sims.append((t, score))
        sims.sort(key=lambda x: x[1], reverse=True)
        results[s] = sims[:top_k] 

    print("\n3. Top-k Embeddings")
    for s_uri, top3 in results.items():
        if s_uri in KNOWN_SOURCE_CLASSES:
            print(f"Source class URI: {s_uri}")
            for t_uri, sim in top3:
                print(f"  Target class URI: {t_uri}  |  Similarity: {sim:.4f}")
            print()
            
    source_contexts = extract_class_contexts(source_graph)
    target_contexts = extract_class_contexts(target_graph)
    
    filtered_results = {
    s_uri: top
    for s_uri, top in results.items()
    if s_uri in KNOWN_SOURCE_CLASSES
    }
    
    print("Size of Alignments", len(reference_alignments), len(filtered_results))
    print("\n4. LLM Alignment...")
    run_llm_alignment_with_ollama(source_contexts, target_contexts, filtered_results, top_k, reference_alignments) 
    
if __name__ == "__main__":
    main()
