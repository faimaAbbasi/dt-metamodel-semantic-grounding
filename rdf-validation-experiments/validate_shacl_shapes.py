"""
Enhanced SHACL Validation with Visualization
Validates RDF metamodel against SHACL shapes and generates detailed reports.
"""

from rdflib import Graph, URIRef, RDFS, RDF, OWL, Literal, BNode, Namespace
from typing import Dict, List, Any
import json
import os
from datetime import datetime
import sys

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

# ==================== SHACL SHAPE DEFINITIONS ====================

def create_comprehensive_shacl_shapes() -> Graph:
    """
    Create advanced SHACL shapes for complete metamodel validation.
    Includes cardinality constraints, property type checks, and domain/range validation.
    """
    sh = Namespace("http://www.w3.org/ns/shacl#")
    ex = Namespace("http://example.org/")
    shapes_graph = Graph()
    
    shapes_graph.bind("sh", sh)
    shapes_graph.bind("ex", ex)
    shapes_graph.bind("rdfs", RDFS)
    shapes_graph.bind("rdf", RDF)
    shapes_graph.bind("owl", OWL)
    
    # ===== CLASS SHAPE =====
    class_shape = ex.ClassShape
    shapes_graph.add((class_shape, RDF.type, sh.NodeShape))
    shapes_graph.add((class_shape, sh.targetClass, RDFS.Class))
    shapes_graph.add((class_shape, sh.description, Literal("Validates RDFS Class definitions")))
    
    # Class must have exactly one label
    label_shape = BNode()
    shapes_graph.add((class_shape, sh.property, label_shape))
    shapes_graph.add((label_shape, sh.path, RDFS.label))
    shapes_graph.add((label_shape, sh.minCount, Literal(1)))
    shapes_graph.add((label_shape, sh.maxCount, Literal(1)))
    shapes_graph.add((label_shape, sh.nodeKind, sh.Literal))
    shapes_graph.add((label_shape, sh.message, 
        Literal("Class must have exactly one rdfs:label (string literal)")))
    
    # Class should have comment
    comment_shape = BNode()
    shapes_graph.add((class_shape, sh.property, comment_shape))
    shapes_graph.add((comment_shape, sh.path, RDFS.comment))
    shapes_graph.add((comment_shape, sh.minCount, Literal(0)))
    shapes_graph.add((comment_shape, sh.message, 
        Literal("Class should have rdfs:comment for documentation")))
    
    # ===== DATATYPE PROPERTY SHAPE =====
    datatype_prop_shape = ex.DatatypePropertyShape
    shapes_graph.add((datatype_prop_shape, RDF.type, sh.NodeShape))
    shapes_graph.add((datatype_prop_shape, sh.targetClass, OWL.DatatypeProperty))
    shapes_graph.add((datatype_prop_shape, sh.description, 
        Literal("Validates OWL DatatypeProperty definitions")))
    
    # Must have domain
    dt_domain = BNode()
    shapes_graph.add((datatype_prop_shape, sh.property, dt_domain))
    shapes_graph.add((dt_domain, sh.path, RDFS.domain))
    shapes_graph.add((dt_domain, sh.minCount, Literal(1)))
    shapes_graph.add((dt_domain, sh.nodeKind, sh.IRI))
    shapes_graph.add((dt_domain, sh.message, 
        Literal("DatatypeProperty must have rdfs:domain pointing to a class")))
    
    # Must have range
    dt_range = BNode()
    shapes_graph.add((datatype_prop_shape, sh.property, dt_range))
    shapes_graph.add((dt_range, sh.path, RDFS.range))
    shapes_graph.add((dt_range, sh.minCount, Literal(1)))
    shapes_graph.add((dt_range, sh.message, 
        Literal("DatatypeProperty must have rdfs:range")))
    
    # ===== OBJECT PROPERTY SHAPE =====
    object_prop_shape = ex.ObjectPropertyShape
    shapes_graph.add((object_prop_shape, RDF.type, sh.NodeShape))
    shapes_graph.add((object_prop_shape, sh.targetClass, OWL.ObjectProperty))
    shapes_graph.add((object_prop_shape, sh.description, 
        Literal("Validates OWL ObjectProperty definitions")))
    
    # Must have domain
    obj_domain = BNode()
    shapes_graph.add((object_prop_shape, sh.property, obj_domain))
    shapes_graph.add((obj_domain, sh.path, RDFS.domain))
    shapes_graph.add((obj_domain, sh.minCount, Literal(1)))
    shapes_graph.add((obj_domain, sh.nodeKind, sh.IRI))
    shapes_graph.add((obj_domain, sh.message, 
        Literal("ObjectProperty must have rdfs:domain")))
    
    # Must have range (must be a class)
    obj_range = BNode()
    shapes_graph.add((object_prop_shape, sh.property, obj_range))
    shapes_graph.add((obj_range, sh.path, RDFS.range))
    shapes_graph.add((obj_range, sh.minCount, Literal(1)))
    shapes_graph.add((obj_range, sh.nodeKind, sh.IRI))
    shapes_graph.add((obj_range, sh.message, 
        Literal("ObjectProperty must have rdfs:range pointing to a class")))
    
    # ===== GENERAL PROPERTY SHAPE =====
    prop_shape = ex.PropertyShape
    shapes_graph.add((prop_shape, RDF.type, sh.NodeShape))
    shapes_graph.add((prop_shape, sh.targetClass, RDF.Property))
    shapes_graph.add((prop_shape, sh.description, Literal("Validates RDF Property")))
    
    # Properties must have domain
    prop_domain = BNode()
    shapes_graph.add((prop_shape, sh.property, prop_domain))
    shapes_graph.add((prop_domain, sh.path, RDFS.domain))
    shapes_graph.add((prop_domain, sh.minCount, Literal(1)))
    shapes_graph.add((prop_domain, sh.message, 
        Literal("Property must have rdfs:domain")))
    
    # Properties must have range
    prop_range = BNode()
    shapes_graph.add((prop_shape, sh.property, prop_range))
    shapes_graph.add((prop_range, sh.path, RDFS.range))
    shapes_graph.add((prop_range, sh.minCount, Literal(1)))
    shapes_graph.add((prop_range, sh.message, 
        Literal("Property must have rdfs:range")))
    
    return shapes_graph

# ==================== VALIDATION ====================

def validate_with_pyshacl(data_graph: Graph, shapes_graph: Graph) -> Dict[str, Any]:
    """
    Validate using pyshacl library with detailed reporting.
    """
    try:
        import pyshacl
    except ImportError:
        return {
            "status": "skipped",
            "reason": "pyshacl not installed. Run: pip install pyshacl",
            "installation_hint": "pip install pyshacl"
        }
    
    try:
        conforms, report_graph, report_text = pyshacl.validate(
            data_graph,
            shapesgraph=shapes_graph,
            inference=None,
            abort_on_error=False,
            debug=False
        )
        
        violations = _extract_violations(report_graph)
        
        return {
            "status": "completed",
            "conforms": conforms,
            "violations_count": len(violations),
            "violations": violations,
            "report_text": report_text
        }
    except Exception as e:
        return {
            "status": "error",
            "error": str(e),
            "error_type": type(e).__name__
        }

def _extract_violations(report_graph: Graph) -> List[Dict[str, Any]]:
    """Extract and categorize violations from SHACL report"""
    sh = Namespace("http://www.w3.org/ns/shacl#")
    violations = []
    
    for report in report_graph.subjects(RDF.type, sh.ValidationReport):
        for result in report_graph.objects(report, sh.result):
            violation = {
                "focusNode": str(report_graph.value(result, sh.focusNode)),
                "resultPath": str(report_graph.value(result, sh.resultPath)),
                "resultMessage": str(report_graph.value(result, sh.resultMessage)),
                "severity": str(report_graph.value(result, sh.resultSeverity, default="Unknown"))
            }
            violations.append(violation)
    
    return violations

# ==================== MANUAL VALIDATION FALLBACK ====================

def validate_shacl_constraints_manual(data_graph: Graph) -> Dict[str, Any]:
    """
    Fallback validation when pyshacl is not available.
    Manually checks SHACL constraints.
    """
    violations = []
    stats = {
        "total_classes": 0,
        "total_properties": 0,
        "classes_with_labels": 0,
        "properties_with_domain": 0,
        "properties_with_range": 0
    }
    
    # Extract all classes and properties
    classes = set()
    for c in data_graph.subjects(RDF.type, OWL.Class):
        if isinstance(c, URIRef):
            classes.add(str(c))
    for c in data_graph.subjects(RDF.type, RDFS.Class):
        if isinstance(c, URIRef):
            classes.add(str(c))
    
    properties = set()
    for p in data_graph.subjects(RDF.type, OWL.ObjectProperty):
        if isinstance(p, URIRef):
            properties.add(str(p))
    for p in data_graph.subjects(RDF.type, OWL.DatatypeProperty):
        if isinstance(p, URIRef):
            properties.add(str(p))
    for p in data_graph.subjects(RDF.type, RDF.Property):
        if isinstance(p, URIRef):
            properties.add(str(p))
    
    stats["total_classes"] = len(classes)
    stats["total_properties"] = len(properties)
    
    # Check class constraints
    for cls_uri in classes:
        cls_ref = URIRef(cls_uri)
        
        # Check label
        has_label = data_graph.value(cls_ref, RDFS.label) is not None
        if has_label:
            stats["classes_with_labels"] += 1
        else:
            violations.append({
                "focusNode": cls_uri,
                "resultPath": str(RDFS.label),
                "resultMessage": "Class must have exactly one rdfs:label",
                "severity": "VIOLATION"
            })
    
    # Check property constraints
    for prop_uri in properties:
        prop_ref = URIRef(prop_uri)
        
        # Check domain
        has_domain = data_graph.value(prop_ref, RDFS.domain) is not None
        if has_domain:
            stats["properties_with_domain"] += 1
        else:
            violations.append({
                "focusNode": prop_uri,
                "resultPath": str(RDFS.domain),
                "resultMessage": "Property must have rdfs:domain",
                "severity": "VIOLATION"
            })
        
        # Check range
        has_range = data_graph.value(prop_ref, RDFS.range) is not None
        if has_range:
            stats["properties_with_range"] += 1
        else:
            violations.append({
                "focusNode": prop_uri,
                "resultPath": str(RDFS.range),
                "resultMessage": "Property must have rdfs:range",
                "severity": "VIOLATION"
            })
    
    conforms = len(violations) == 0
    
    return {
        "status": "completed_manual",
        "conforms": conforms,
        "violations_count": len(violations),
        "violations": violations[:20],  # Limit output
        "statistics": stats
    }


def validate_json_constraints(metamodel: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Validate JSON constraints equivalent to the RDF SHACL requirements."""
    violations = []
    class_names = {
        item.get("name") for item in metamodel
        if isinstance(item, dict) and isinstance(item.get("name"), str)
    }

    for index, item in enumerate(metamodel):
        if not isinstance(item, dict):
            violations.append({"item": index, "message": "Class entry must be an object"})
            continue
        for field in ("name", "description", "primitive_attributes", "reference_attributes"):
            if field not in item:
                violations.append({"item": index, "message": f"Missing field: {field}"})
        for reference in item.get("reference_attributes", []):
            if not isinstance(reference, str) or ":" not in reference:
                violations.append({"item": index, "message": "Malformed reference attribute"})
                continue
            target = reference.split(":", 1)[1].replace("[]", "").strip()
            if target not in class_names:
                violations.append({"item": index, "message": f"Unknown reference target: {target}"})

    return {
        "status": "completed",
        "conforms": not violations,
        "violations_count": len(violations),
        "violations": violations[:20],
        "validation_type": "JSON constraints equivalent to SHACL requirements",
    }

# ==================== REPORT GENERATION ====================

def run_shacl_validation(
    data_graph_path: str = None,
    data_graph: Graph = None,
    output_dir: str = None
) -> Dict[str, Any]:
    """
    Run comprehensive SHACL validation on metamodel RDF.
    Supports both file path and Graph object inputs.
    """
    print("\n" + "="*80)
    print("ENHANCED SHACL VALIDATION")
    print("="*80)
    
    # Initialize paths
    if output_dir is None:
        output_dir = get_output_dir()
    
    # Load or use provided graph
    if data_graph is None:
        if data_graph_path is None:
            data_graph_path = os.path.join(get_project_output_dir(), 'metamodel.json')
        
        print(f"\n[1/3] Loading RDF graph from metamodel...")
        try:
            import json
            with open(data_graph_path.replace('.ttl', '.json'), 'r', encoding='utf-8') as f:
                metamodel_json = json.load(f)
            
            BASE = Namespace("http://metamodel#")
            data_graph = Graph()
            data_graph.bind("meta", BASE)
            data_graph.bind("rdfs", RDFS)
            data_graph.bind("owl", OWL)
            
            for cls in metamodel_json:
                class_uri = BASE[cls["name"]]
                data_graph.add((class_uri, RDF.type, RDFS.Class))
                data_graph.add((class_uri, RDFS.label, Literal(cls["name"])))
                data_graph.add((class_uri, RDFS.comment, Literal(cls["description"])))

                for attr in cls.get("primitive_attributes", []):
                    if ":" in attr:
                        attr_name, attr_type = map(str.strip, attr.split(":"))
                        prop_uri = BASE[f"{cls['name']}_{attr_name}"]
                        data_graph.add((prop_uri, RDF.type, OWL.DatatypeProperty))
                        data_graph.add((prop_uri, RDFS.domain, class_uri))
                        data_graph.add((prop_uri, RDFS.range, Literal(attr_type)))

                for ref in cls.get("reference_attributes", []):
                    if ":" in ref:
                        ref_name, ref_type_raw = map(str.strip, ref.split(":"))
                        ref_type = ref_type_raw.replace("[]", "")
                        prop_uri = BASE[f"{cls['name']}_{ref_name}"]
                        target_uri = BASE[ref_type]
                        data_graph.add((prop_uri, RDF.type, OWL.ObjectProperty))
                        data_graph.add((prop_uri, RDFS.domain, class_uri))
                        data_graph.add((prop_uri, RDFS.range, target_uri))
            
            print(f"✓ Loaded RDF graph: {len(data_graph)} triples")
        except Exception as e:
            print(f"✗ Error loading graph: {e}")
            return {"error": str(e)}
    
    # Create SHACL shapes
    print("\n[2/3] Creating SHACL shape definitions...")
    shapes_graph = create_comprehensive_shacl_shapes()
    print(f"✓ Created SHACL shapes: {len(shapes_graph)} triples")
    
    # Validate
    print("\n[3/3] Running SHACL validation...")
    validation_result = validate_with_pyshacl(data_graph, shapes_graph)
    
    # Fallback if pyshacl not available
    if validation_result.get("status") == "skipped":
        print("⚠ pyshacl not installed, using manual validation fallback...")
        validation_result = validate_shacl_constraints_manual(data_graph)

    json_validation_result = {"status": "skipped", "reason": "JSON metamodel not loaded"}
    json_path = os.path.join(get_project_output_dir(), "metamodel.json")
    try:
        with open(json_path, "r", encoding="utf-8") as file:
            json_validation_result = validate_json_constraints(json.load(file))
    except (OSError, json.JSONDecodeError) as error:
        json_validation_result = {
            "status": "error",
            "error": str(error),
        }
    
    # Compile results
    results = {
        "timestamp": datetime.now().isoformat(),
        "validation_method": "SHACL-based",
        "data_graph": {
            "triples": len(data_graph),
            "classes": len({
                c for class_type in (OWL.Class, RDFS.Class)
                for c in data_graph.subjects(RDF.type, class_type)
            }),
            "properties": len({
                p for property_type in (OWL.ObjectProperty, OWL.DatatypeProperty, RDF.Property)
                for p in data_graph.subjects(RDF.type, property_type)
            })
        },
        "shapes_graph": {
            "triples": len(shapes_graph)
        },
        "validation": validation_result,
        "json_validation": json_validation_result,
    }
    
    # Print summary
    print("\n" + "="*80)
    print("VALIDATION RESULTS")
    print("="*80)
    
    if validation_result.get("status") == "skipped":
        print(f"⊘ Status: SKIPPED")
        print(f"  Reason: {validation_result['reason']}")
        print(f"  Installation: {validation_result.get('installation_hint', 'N/A')}")
    elif validation_result.get("status") == "error":
        print(f"✗ Status: ERROR")
        print(f"  Error: {validation_result['error']}")
    else:
        conforms = validation_result.get("conforms", False)
        violations = validation_result.get("violations_count", 0)
        
        if conforms:
            print(f"✓ Status: CONFORMS")
            print(f"  The RDF metamodel satisfies all SHACL shape constraints!")
        else:
            print(f"✗ Status: NON-CONFORMING")
            print(f"  Violations found: {violations}")
            
            if violations > 0:
                print(f"\n  First violations:")
                for v in validation_result['violations'][:3]:
                    print(f"    - {v.get('resultMessage', 'Unknown')}")
                    if 'focusNode' in v:
                        node_name = v['focusNode'].split('#')[-1] if '#' in v['focusNode'] else v['focusNode']
                        print(f"      on: {node_name}")

    print("\nJSON representation constraints:")
    if json_validation_result.get("conforms"):
        print("  ✓ JSON conforms to the equivalent structural constraints")
    else:
        print(f"  ✗ JSON violations found: {json_validation_result.get('violations_count', 0)}")
    
    # Save results
    results_dir = get_validation_results_dir()
    output_path = os.path.join(results_dir, 'shacl-validation-report.json')
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(results, f, indent=2, default=str)
    
    print(f"\n✓ Validation report saved to: {output_path}")
    
    return results

# ==================== ENTRY POINT ====================

if __name__ == "__main__":
    run_shacl_validation()
