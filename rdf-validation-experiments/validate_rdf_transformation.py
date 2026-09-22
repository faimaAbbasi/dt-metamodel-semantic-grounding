"""
RDF Transformation Validation Module
Validates that the transformation from metamodel to RDF preserves structure and semantics.

Includes:
- Round-trip validation (transform → reconstruct → compare)
- Schema completeness checks
- SHACL shape validation (optional, requires pyshacl)
- Semantic equivalence tests (SPARQL queries)
"""

from rdflib import Graph, URIRef, RDFS, RDF, OWL, Literal, BNode, Namespace
from typing import List, Tuple, Set, Dict, Any
import json
import os
import sys
from datetime import datetime

# ==================== PATH HELPERS ====================

def get_output_dir():
    """Get the absolute path to output directory"""
    # Script is now in: dt-model-alignment/rdf-validation/
    # Output should be at: dt-model-alignment/rdf-validation/output/
    script_dir = os.path.dirname(os.path.abspath(__file__))
    return os.path.join(script_dir, 'output')

def get_project_root():
    """Get the main project root directory"""
    script_dir = os.path.dirname(os.path.abspath(__file__))
    # Script is in: dt-model-alignment/rdf-validation/
    # Project root is: dt-model-alignment/
    return os.path.dirname(script_dir)

def get_project_output_dir():
    """Get the main project output directory for input files"""
    return os.path.join(get_project_root(), 'output')

def get_validation_results_dir():
    """Get the absolute path to validation results subfolder"""
    results_dir = os.path.join(get_output_dir(), 'validation-results')
    os.makedirs(results_dir, exist_ok=True)
    return results_dir

# ==================== UTILITIES ====================

def extract_local_name(uri: str) -> str:
    """Extract local name from URI (after last # or /)"""
    if '#' in uri:
        return uri.split('#')[-1]
    else:
        return uri.rstrip('/').split('/')[-1]

def is_uri(value: str) -> bool:
    """Check if value is a valid URI"""
    import re
    return bool(re.match(r'^(http|https|ftp|urn):', value))

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

def extract_classes(graph: Graph) -> Set[str]:
    """Return a set of all class URIs in the graph"""
    classes = set()
    for c in graph.subjects(RDF.type, OWL.Class):
        if isinstance(c, URIRef):
            classes.add(str(c))
    for c in graph.subjects(RDF.type, RDFS.Class):
        if isinstance(c, URIRef):
            classes.add(str(c))
    return classes

def extract_properties(graph: Graph) -> Set[str]:
    """Return a set of all property URIs in the graph"""
    props = set()
    for p in graph.subjects(RDF.type, OWL.ObjectProperty):
        if isinstance(p, URIRef):
            props.add(str(p))
    for p in graph.subjects(RDF.type, OWL.DatatypeProperty):
        if isinstance(p, URIRef):
            props.add(str(p))
    for p in graph.subjects(RDF.type, RDF.Property):
        if isinstance(p, URIRef):
            props.add(str(p))
    return props

# ==================== 1. ROUND-TRIP VALIDATION ====================

def reconstruct_metamodel_from_rdf(graph: Graph) -> List[Dict]:
    """
    Reconstruct metamodel JSON from RDF graph to validate round-trip property.
    """
    reconstructed = []
    
    for class_uri in extract_classes(graph):
        class_ref = URIRef(class_uri)
        
        # Extract basic class info
        label = extract_local_name(class_uri)
        comment_node = graph.value(class_ref, RDFS.comment)
        description = str(comment_node) if comment_node else ""
        
        # Extract primitive attributes (datatype properties)
        primitive_attrs = []
        for prop in graph.subjects(RDFS.domain, class_ref):
            if isinstance(prop, BNode):
                continue
            prop_local_name = extract_local_name(str(prop))
            prop_label = prop_local_name.split("_", 1)[-1]
            range_val = graph.value(prop, RDFS.range)
            
            # Check if it's a datatype property
            prop_type = graph.value(prop, RDF.type)
            is_datatype = prop_type == OWL.DatatypeProperty or isinstance(range_val, Literal)
            
            if is_datatype or (range_val and not isinstance(range_val, URIRef)):
                range_name = str(range_val) if range_val else "unknown"
                primitive_attrs.append(f"{prop_label}: {range_name}")
        
        # Extract reference attributes (object properties)
        ref_attrs = []
        for prop in graph.subjects(RDFS.domain, class_ref):
            if isinstance(prop, BNode):
                continue
            prop_local_name = extract_local_name(str(prop))
            prop_label = prop_local_name.split("_", 1)[-1]
            range_val = graph.value(prop, RDFS.range)
            
            # Check if it's an object property
            prop_type = graph.value(prop, RDF.type)
            is_object = prop_type == OWL.ObjectProperty or isinstance(range_val, URIRef)
            
            if is_object and isinstance(range_val, URIRef):
                range_name = extract_local_name(str(range_val))
                ref_attrs.append(f"{prop_label}: {range_name}")
        
        reconstructed.append({
            "name": label,
            "description": description,
            "primitive_attributes": primitive_attrs,
            "reference_attributes": ref_attrs
        })
    
    return reconstructed

def validate_round_trip(original_json: List[Dict], reconstructed_json: List[Dict]) -> Dict[str, Any]:
    """
    Compare original and reconstructed metamodels.
    Returns metrics on preservation of structure.
    """
    results = {
        "class_count_match": len(original_json) == len(reconstructed_json),
        "original_class_count": len(original_json),
        "reconstructed_class_count": len(reconstructed_json),
        "class_preservation_rate": 0.0,
        "attribute_preservation_rate": 0.0,
        "preserved_classes": [],
        "missing_classes": [],
        "details": []
    }
    
    # Map classes by name for comparison
    orig_by_name = {c["name"].lower(): c for c in original_json}
    recon_by_name = {c["name"].lower(): c for c in reconstructed_json}
    
    preserved_classes = 0
    total_preserved_attrs = 0
    total_orig_attrs = 0
    
    for name, orig_class in orig_by_name.items():
        if name in recon_by_name:
            preserved_classes += 1
            results["preserved_classes"].append(name)
            recon_class = recon_by_name[name]
            
            orig_attrs = (orig_class.get("primitive_attributes", []) + 
                         orig_class.get("reference_attributes", []))
            recon_attrs = (recon_class.get("primitive_attributes", []) + 
                          recon_class.get("reference_attributes", []))
            
            total_orig_attrs += len(orig_attrs)
            # Count matching attributes (case-insensitive)
            orig_attrs_lower = [a.lower() for a in orig_attrs]
            recon_attrs_lower = [a.lower() for a in recon_attrs]
            matching = sum(1 for a in orig_attrs_lower if a in recon_attrs_lower)
            total_preserved_attrs += matching
            
            if len(orig_attrs) != len(recon_attrs):
                results["details"].append({
                    "class": name,
                    "original_attr_count": len(orig_attrs),
                    "reconstructed_attr_count": len(recon_attrs),
                    "status": "attribute_mismatch",
                    "preserved_attrs": matching,
                    "preserved_attrs_pct": matching / max(len(orig_attrs), 1)
                })
        else:
            results["missing_classes"].append(name)
    
    results["class_preservation_rate"] = preserved_classes / max(len(orig_by_name), 1)
    results["attribute_preservation_rate"] = (total_preserved_attrs / max(total_orig_attrs, 1) 
                                             if total_orig_attrs > 0 else 0.0)
    
    return results


def build_rdf_graph_from_metamodel(metamodel: List[Dict]) -> Graph:
    """Build the canonical RDF graph used by transformation experiments."""
    BASE = Namespace("http://metamodel#")
    graph = Graph()
    graph.bind("meta", BASE)
    graph.bind("rdfs", RDFS)
    graph.bind("rdf", RDF)
    graph.bind("owl", OWL)

    for cls in metamodel:
        class_uri = BASE[cls["name"]]
        graph.add((class_uri, RDF.type, RDFS.Class))
        graph.add((class_uri, RDFS.label, Literal(cls["name"])))
        graph.add((class_uri, RDFS.comment, Literal(cls.get("description", ""))))

        for attr in cls.get("primitive_attributes", []):
            if ":" in attr:
                attr_name, attr_type = map(str.strip, attr.split(":", 1))
                prop_uri = BASE[f"{cls['name']}_{attr_name}"]
                graph.add((prop_uri, RDF.type, OWL.DatatypeProperty))
                graph.add((prop_uri, RDFS.domain, class_uri))
                graph.add((prop_uri, RDFS.range, Literal(attr_type)))

        for ref in cls.get("reference_attributes", []):
            if ":" in ref:
                ref_name, ref_type_raw = map(str.strip, ref.split(":", 1))
                ref_type = ref_type_raw.replace("[]", "")
                prop_uri = BASE[f"{cls['name']}_{ref_name}"]
                graph.add((prop_uri, RDF.type, OWL.ObjectProperty))
                graph.add((prop_uri, RDFS.domain, class_uri))
                graph.add((prop_uri, RDFS.range, BASE[ref_type]))

    return graph


def validate_json_representation(metamodel: List[Dict]) -> Dict[str, Any]:
    """Measure JSON structure, schema completeness, and reference integrity."""
    total_classes = len(metamodel)
    valid_names = {
        item.get("name") for item in metamodel
        if isinstance(item, dict)
        and isinstance(item.get("name"), str)
        and item["name"].strip()
    }
    class_rate = len(valid_names) / total_classes if total_classes else 0.0

    required_fields = (
        ("name", str),
        ("description", str),
        ("primitive_attributes", list),
        ("reference_attributes", list),
    )
    schema_checks = [
        isinstance(item, dict)
        and field in item
        and isinstance(item[field], expected_type)
        for item in metamodel
        for field, expected_type in required_fields
    ]
    schema_rate = sum(schema_checks) / len(schema_checks) if schema_checks else 0.0

    references = [
        reference.split(":", 1)[1].replace("[]", "").strip()
        for item in metamodel
        if isinstance(item, dict)
        for reference in item.get("reference_attributes", [])
        if isinstance(reference, str) and ":" in reference
    ]
    valid_reference_count = sum(reference in valid_names for reference in references)
    semantic_rate = (
        valid_reference_count / len(references) if references else 1.0
    )

    return {
        "structure_preservation_rate": class_rate,
        "schema_completeness_score": schema_rate,
        "semantic_equivalence_rate": semantic_rate,
        "class_preservation_rate": class_rate,
        "details": {
            "class_count": total_classes,
            "valid_class_names": len(valid_names),
            "schema_checks": len(schema_checks),
            "schema_checks_passed": sum(schema_checks),
            "reference_count": len(references),
            "valid_references": valid_reference_count,
        },
    }

# ==================== 2. SCHEMA COMPLETENESS CHECKS ====================

def validate_schema_completeness(graph: Graph) -> Dict[str, Any]:
    """
    Verify that all metamodel elements have required properties.
    """
    results = {
        "total_classes": 0,
        "classes_with_labels": 0,
        "classes_with_comments": 0,
        "properties_with_domain": 0,
        "properties_with_range": 0,
        "total_properties": 0,
        "object_properties": 0,
        "datatype_properties": 0,
        "completeness_score": 0.0,
        "issues": [],
        "class_details": []
    }
    
    classes = extract_classes(graph)
    results["total_classes"] = len(classes)
    
    # Check all classes have labels and comments
    for cls_uri in classes:
        cls_ref = URIRef(cls_uri)
        has_label = graph.value(cls_ref, RDFS.label) is not None
        has_comment = graph.value(cls_ref, RDFS.comment) is not None
        
        class_detail = {
            "uri": cls_uri,
            "has_label": has_label,
            "has_comment": has_comment
        }
        results["class_details"].append(class_detail)
        
        if has_label:
            results["classes_with_labels"] += 1
        else:
            results["issues"].append({
                "type": "missing_label",
                "element": cls_uri,
                "element_type": "class",
                "severity": "medium"
            })
        
        if has_comment:
            results["classes_with_comments"] += 1
    
    # Check all properties have domain and range
    props = extract_properties(graph)
    results["total_properties"] = len(props)
    
    for prop_uri in props:
        prop_ref = URIRef(prop_uri)
        has_domain = graph.value(prop_ref, RDFS.domain) is not None
        has_range = graph.value(prop_ref, RDFS.range) is not None
        prop_type = graph.value(prop_ref, RDF.type)
        
        if prop_type == OWL.ObjectProperty:
            results["object_properties"] += 1
        elif prop_type == OWL.DatatypeProperty:
            results["datatype_properties"] += 1
        
        if has_domain:
            results["properties_with_domain"] += 1
        else:
            results["issues"].append({
                "type": "missing_domain",
                "property": prop_uri,
                "element_type": "property",
                "severity": "high"
            })
        
        if has_range:
            results["properties_with_range"] += 1
        else:
            results["issues"].append({
                "type": "missing_range",
                "property": prop_uri,
                "element_type": "property",
                "severity": "high"
            })
    
    # Calculate overall completeness
    total_checks = (results["total_classes"] + results["total_properties"] * 2)
    total_valid = (results["classes_with_labels"] + 
                  results["properties_with_domain"] + 
                  results["properties_with_range"])
    
    results["completeness_score"] = total_valid / max(total_checks, 1) if total_checks > 0 else 1.0
    
    return results

# ==================== 3. SHACL VALIDATION ====================

def create_metamodel_shacl_shapes() -> Graph:
    """
    Create SHACL shape definitions for validating RDF metamodel.
    Returns a Graph with SHACL constraints.
    """
    sh = Namespace("http://www.w3.org/ns/shacl#")
    shapes = Graph()
    shapes.bind("sh", sh)
    
    META = Namespace("http://metamodel#")
    shapes.bind("meta", META)
    
    # Shape for Classes
    class_shape = META.ClassShape
    shapes.add((class_shape, RDF.type, sh.NodeShape))
    shapes.add((class_shape, sh.targetClass, RDFS.Class))
    shapes.add((class_shape, sh.closed, Literal(False)))
    
    # Every class must have a label
    label_prop = BNode()
    shapes.add((class_shape, sh.property, label_prop))
    shapes.add((label_prop, sh.path, RDFS.label))
    shapes.add((label_prop, sh.minCount, Literal(1)))
    shapes.add((label_prop, sh.message, Literal("Class must have at least one rdfs:label")))
    
    # Shape for Properties
    prop_shape = META.PropertyShape
    shapes.add((prop_shape, RDF.type, sh.NodeShape))
    shapes.add((prop_shape, sh.targetClass, RDF.Property))
    
    # Every property must have domain
    domain_prop = BNode()
    shapes.add((prop_shape, sh.property, domain_prop))
    shapes.add((domain_prop, sh.path, RDFS.domain))
    shapes.add((domain_prop, sh.minCount, Literal(1)))
    shapes.add((domain_prop, sh.message, Literal("Property must have rdfs:domain")))
    
    # Every property must have range
    range_prop = BNode()
    shapes.add((prop_shape, sh.property, range_prop))
    shapes.add((range_prop, sh.path, RDFS.range))
    shapes.add((range_prop, sh.minCount, Literal(1)))
    shapes.add((range_prop, sh.message, Literal("Property must have rdfs:range")))
    
    return shapes

def validate_with_shacl(data_graph: Graph) -> Dict[str, Any]:
    """
    Validate RDF graph using SHACL. Requires pyshacl.
    Install: pip install pyshacl
    """
    try:
        import pyshacl
    except ImportError:
        return {
            "status": "skipped",
            "reason": "pyshacl not installed. Install with: pip install pyshacl",
            "conforms": None,
            "violations": []
        }
    
    shapes_graph = create_metamodel_shacl_shapes()
    
    try:
        conforms, report_graph, report_text = pyshacl.validate(
            data_graph,
            shapesgraph=shapes_graph,
            inference=None,
            abort_on_error=False
        )
        
        violations = []
        if not conforms:
            violations = _parse_shacl_report(report_graph)
        
        return {
            "status": "completed",
            "conforms": conforms,
            "report_text": report_text,
            "violations_count": len(violations),
            "violations": violations
        }
    except Exception as e:
        return {
            "status": "error",
            "error": str(e),
            "conforms": None,
            "violations": []
        }

def _parse_shacl_report(report_graph: Graph) -> List[Dict]:
    """Helper to extract violations from SHACL report."""
    sh = Namespace("http://www.w3.org/ns/shacl#")
    violations = []
    
    for report in report_graph.subjects(RDF.type, sh.ValidationReport):
        for result in report_graph.objects(report, sh.result):
            violation = {
                "focusNode": str(report_graph.value(result, sh.focusNode)),
                "resultPath": str(report_graph.value(result, sh.resultPath)),
                "message": str(report_graph.value(result, sh.resultMessage))
            }
            violations.append(violation)
    
    return violations

# ==================== 4. SEMANTIC EQUIVALENCE VALIDATION ====================

def semantic_equivalence_test(
    original_graph: Graph,
    rdf_graph: Graph,
    test_queries: List[Dict[str, str]] = None
) -> Dict[str, Any]:
    """
    Run equivalent semantic queries on both representations.
    Compare results to verify semantic preservation.
    """
    if test_queries is None:
        test_queries = [
            {
                "name": "All classes",
                "query": "SELECT ?class WHERE { ?class a rdfs:Class . }"
            },
            {
                "name": "All classes (OWL)",
                "query": "SELECT ?class WHERE { ?class a owl:Class . }"
            },
            {
                "name": "All properties with domain",
                "query": "SELECT ?prop ?domain WHERE { ?prop rdfs:domain ?domain . }"
            },
            {
                "name": "All properties with range",
                "query": "SELECT ?prop ?range WHERE { ?prop rdfs:range ?range . }"
            },
            {
                "name": "Count of all triples",
                "query": "SELECT (COUNT(*) as ?count) WHERE { ?s ?p ?o . }"
            }
        ]
    
    results = {
        "queries_tested": len(test_queries),
        "queries_equivalent": 0,
        "semantic_equivalence_rate": 0.0,
        "query_results": []
    }
    
    # Prepare namespace bindings
    for graph_obj in [original_graph, rdf_graph]:
        graph_obj.bind("rdfs", RDFS)
        graph_obj.bind("rdf", RDF)
        graph_obj.bind("owl", OWL)
    
    for test_query in test_queries:
        query = test_query["query"]
        
        try:
            # Run on original (JSON-derived) graph
            original_results = list(original_graph.query(query))
            
            # Run on RDF graph
            rdf_results = list(rdf_graph.query(query))
            
            # Compare results
            orig_set = set(str(r) for r in original_results)
            rdf_set = set(str(r) for r in rdf_results)
            are_equivalent = orig_set == rdf_set
            
            if are_equivalent:
                results["queries_equivalent"] += 1
            
            results["query_results"].append({
                "query_name": test_query["name"],
                "query": query,
                "original_result_count": len(original_results),
                "rdf_result_count": len(rdf_results),
                "equivalent": are_equivalent,
                "sample_original": [str(r)[:80] for r in original_results[:2]],
                "sample_rdf": [str(r)[:80] for r in rdf_results[:2]]
            })
        except Exception as e:
            results["query_results"].append({
                "query_name": test_query["name"],
                "query": query,
                "error": str(e),
                "equivalent": False
            })
    
    results["semantic_equivalence_rate"] = (
        results["queries_equivalent"] / max(results["queries_tested"], 1)
    )
    
    return results

# ==================== MAIN VALIDATION RUNNER ====================

def run_all_validations(metamodel_json_path: str = None) -> Dict[str, Any]:
    """
    Load metamodel, generate RDF, and run all validation tests.
    Returns comprehensive validation report.
    """
    if metamodel_json_path is None:
        metamodel_json_path = os.path.join(get_project_output_dir(), 'metamodel.json')
    
    print("\n" + "="*80)
    print("RDF TRANSFORMATION VALIDATION SUITE")
    print("="*80)
    
    # Load metamodel JSON
    print("\n[1/6] Loading metamodel JSON...")
    try:
        with open(metamodel_json_path, 'r', encoding='utf-8') as f:
            source_model_json = json.load(f)
        print(f"✓ Loaded {len(source_model_json)} classes from metamodel")
    except FileNotFoundError:
        print(f"✗ Cannot find {metamodel_json_path}")
        return {"error": "metamodel.json not found"}
    
    # Generate RDF graph from metamodel
    print("\n[2/6] Generating RDF graph from metamodel...")
    source_graph = build_rdf_graph_from_metamodel(source_model_json)
    
    print(f"✓ Generated RDF graph with {len(source_graph)} triples")
    
    all_results = {
        "timestamp": datetime.now().isoformat(),
        "source_statistics": {
            "json_classes": len(source_model_json),
            "rdf_triples": len(source_graph),
            "rdf_classes": len(extract_classes(source_graph)),
            "rdf_properties": len(extract_properties(source_graph))
        },
        "validations": {}
    }
    
    # 1. ROUND-TRIP VALIDATION
    print("\n[3/6] Running round-trip validation...")
    reconstructed_json = reconstruct_metamodel_from_rdf(source_graph)
    roundtrip_results = validate_round_trip(source_model_json, reconstructed_json)
    all_results["validations"]["roundtrip"] = roundtrip_results

    json_results = validate_json_representation(source_model_json)
    all_results["validations"]["json"] = json_results
    
    print(f"   Class preservation rate: {roundtrip_results['class_preservation_rate']:.1%}")
    print(f"   Attribute preservation rate: {roundtrip_results['attribute_preservation_rate']:.1%}")
    if roundtrip_results['missing_classes']:
        print(f"   ⚠ Missing classes: {len(roundtrip_results['missing_classes'])}")
    if roundtrip_results['details']:
        print(f"   ⚠ Mismatches: {len(roundtrip_results['details'])}")
    
    # 2. SCHEMA COMPLETENESS
    print("\n[4/6] Validating schema completeness...")
    completeness_results = validate_schema_completeness(source_graph)
    all_results["validations"]["completeness"] = completeness_results
    
    print(f"   Classes with labels: {completeness_results['classes_with_labels']}/{completeness_results['total_classes']}")
    print(f"   Classes with comments: {completeness_results['classes_with_comments']}/{completeness_results['total_classes']}")
    print(f"   Properties with domain: {completeness_results['properties_with_domain']}/{completeness_results['total_properties']}")
    print(f"   Properties with range: {completeness_results['properties_with_range']}/{completeness_results['total_properties']}")
    print(f"   Overall completeness score: {completeness_results['completeness_score']:.1%}")
    if completeness_results['issues']:
        print(f"   ⚠ Issues found: {len(completeness_results['issues'])}")
        for issue in completeness_results['issues'][:3]:
            print(f"      - {issue['type']}: {issue['severity']}")
    
    # 3. SHACL VALIDATION
    print("\n[5/6] Running SHACL shape validation...")
    shacl_results = validate_with_shacl(source_graph)
    all_results["validations"]["shacl"] = shacl_results
    
    if shacl_results.get('status') == 'skipped':
        print(f"   ⊘ Skipped: {shacl_results['reason']}")
    elif shacl_results.get('status') == 'error':
        print(f"   ✗ Error: {shacl_results['error']}")
    else:
        print(f"   Conforms to shapes: {shacl_results['conforms']}")
        if not shacl_results['conforms']:
            print(f"   Violations found: {shacl_results['violations_count']}")
    
    # 4. SEMANTIC EQUIVALENCE
    print("\n[6/6] Testing semantic equivalence...")
    reconstructed_graph = build_rdf_graph_from_metamodel(reconstructed_json)
    semantic_results = semantic_equivalence_test(source_graph, reconstructed_graph)
    all_results["validations"]["semantic_equivalence"] = semantic_results
    
    print(f"   Queries tested: {semantic_results['queries_tested']}")
    print(f"   Queries equivalent: {semantic_results['queries_equivalent']}")
    print(f"   Equivalence rate: {semantic_results['semantic_equivalence_rate']:.1%}")
    
    # Summary
    print("\n" + "="*80)
    print("VALIDATION SUMMARY")
    print("="*80)
    
    preservation_quality = roundtrip_results['class_preservation_rate']
    completeness_score = completeness_results['completeness_score']
    semantic_rate = semantic_results['semantic_equivalence_rate']
    
    print(f"✓ Structure Preservation:  {preservation_quality:.1%}")
    print(f"✓ Schema Completeness:     {completeness_score:.1%}")
    print(f"✓ Semantic Equivalence:    {semantic_rate:.1%}")
    
    overall_quality = (preservation_quality + completeness_score + semantic_rate) / 3
    print(f"\n✓ Overall Transformation Quality: {overall_quality:.1%}")
    
    if overall_quality >= 0.95:
        print("  Status: EXCELLENT - RDF transformation preserves structure and semantics")
    elif overall_quality >= 0.90:
        print("  Status: GOOD - Minor issues in transformation")
    elif overall_quality >= 0.80:
        print("  Status: ACCEPTABLE - Some structural/semantic loss detected")
    else:
        print("  Status: POOR - Significant issues in transformation")
    
    all_results["summary"] = {
        "structure_preservation_rate": preservation_quality,
        "schema_completeness_score": completeness_score,
        "semantic_equivalence_rate": semantic_rate,
        "overall_transformation_quality": overall_quality
    }
    all_results["json_summary"] = json_results
    
    return all_results

# ==================== SAVE RESULTS ====================

def save_validation_report(results: Dict[str, Any], output_dir: str = None) -> str:
    """Save validation results to JSON file."""
    if output_dir is None:
        output_dir = get_validation_results_dir()
    
    os.makedirs(output_dir, exist_ok=True)
    
    output_path = os.path.join(output_dir, 'rdf-validation-report.json')
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(results, f, indent=2, default=str)
    
    return output_path

# ==================== ENTRY POINT ====================

if __name__ == "__main__":
    # Run all validations
    validation_results = run_all_validations()
    
    # Save to file
    report_path = save_validation_report(validation_results)
    print(f"\n✓ Full validation report saved to: {report_path}")
    
    # Print details of any issues
    if validation_results.get("validations", {}).get("completeness", {}).get("issues"):
        print("\n" + "="*80)
        print("DETAILED COMPLETENESS ISSUES")
        print("="*80)
        for issue in validation_results["validations"]["completeness"]["issues"][:5]:
            print(f"  [{issue['severity'].upper()}] {issue['type']}")
            if 'element' in issue:
                print(f"         Element: {extract_local_name(issue['element'])}")
            if 'property' in issue:
                print(f"         Property: {extract_local_name(issue['property'])}")
    
    if validation_results.get("validations", {}).get("roundtrip", {}).get("details"):
        print("\n" + "="*80)
        print("DETAILED ROUNDTRIP MISMATCHES")
        print("="*80)
        for detail in validation_results["validations"]["roundtrip"]["details"][:5]:
            pct = detail.get("preserved_attrs_pct", 0) * 100
            print(f"  Class: {detail['class']}")
            print(f"     Original attrs: {detail['original_attr_count']}")
            print(f"     Reconstructed:  {detail['reconstructed_attr_count']}")
            print(f"     Preserved: {detail['preserved_attrs']}/{detail['original_attr_count']} ({pct:.0f}%)")
