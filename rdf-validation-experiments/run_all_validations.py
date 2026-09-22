"""
Master RDF Validation Runner
Executes all RDF-based validation scripts sequentially to avoid errors
and generate comprehensive validation reports.
"""

import sys
import os
from datetime import datetime
import traceback
import json

# Add current directory to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# ==================== PATH RESOLUTION ====================

def get_output_dir():
    """Get the absolute path to output directory"""
    script_dir = os.path.dirname(os.path.abspath(__file__))
    # Script is now in: dt-model-alignment/rdf-validation/
    # Output should be at: dt-model-alignment/rdf-validation/output/
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


def calculate_rdf_validation_metrics(rdf_results, shacl_results, f1_score):
    """Build radar metrics exclusively from RDF validation results."""
    summary = rdf_results.get('summary', {})
    roundtrip = rdf_results.get('validations', {}).get('roundtrip', {})
    return {
        'Structure\nPreservation': summary.get('structure_preservation_rate'),
        'Schema\nCompleteness': summary.get('schema_completeness_score'),
        'Semantic\nEquivalence': summary.get('semantic_equivalence_rate'),
        'Class\nPreservation': roundtrip.get('class_preservation_rate'),
        'SHACL\nConformance': shacl_results.get('validation', {}).get('conforms'),
        'F1 Score': f1_score,
    }

# ==================== VALIDATION IMPORTS ====================
try:
    from validate_rdf_transformation import run_all_validations as run_rdf_validation, save_validation_report
    from validate_shacl_shapes import run_shacl_validation
    from alignment_sensitivity_experiment import run_alignment_sensitivity_experiment, save_results as save_alignment_results, print_results as print_alignment_results
except ImportError as e:
    print(f"\n✗ Import Error: {e}")
    print("Make sure all validation modules are in the same directory")
    sys.exit(1)

def main():
    """Execute all RDF validation scripts"""
    
    print("\n" + "="*80)
    print("RDF-BASED VALIDATION SUITE - MASTER RUNNER")
    print("="*80)
    print(f"\nStarted at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
    
    all_results = {
        "execution_timestamp": datetime.now().isoformat(),
        "results": {},
        "summary": {
            "total_validations": 3,
            "successful": 0,
            "failed": 0,
            "errors": []
        }
    }
    
    # ===== VALIDATION 1: RDF TRANSFORMATION VALIDATION =====
    print("\n" + "="*80)
    print("[1/3] RDF TRANSFORMATION VALIDATION")
    print("="*80)
    
    try:
        print("\n⏱️  Running RDF transformation validation...")
        rdf_validation_results = run_rdf_validation()
        
        if "error" in rdf_validation_results:
            raise Exception(rdf_validation_results["error"])
        
        # Save report
        report_path = save_validation_report(rdf_validation_results)
        all_results["results"]["rdf_transformation"] = {
            "status": "success",
            "report_path": report_path,
            "summary": rdf_validation_results.get("summary", {})
        }
        
        print(f"✓ RDF Transformation Validation: COMPLETED")
        print(f"  Report: {report_path}")
        all_results["summary"]["successful"] += 1
        
    except Exception as e:
        error_msg = f"RDF Transformation Validation failed: {str(e)}"
        print(f"✗ {error_msg}")
        print(f"  Traceback: {traceback.format_exc()[:200]}")
        all_results["results"]["rdf_transformation"] = {
            "status": "failed",
            "error": str(e)
        }
        all_results["summary"]["failed"] += 1
        all_results["summary"]["errors"].append(error_msg)
    
    # ===== VALIDATION 2: SHACL VALIDATION =====
    print("\n" + "="*80)
    print("[2/3] SHACL SHAPE VALIDATION")
    print("="*80)
    
    try:
        print("\n⏱️  Running SHACL shape validation...")
        shacl_results = run_shacl_validation()
        
        if "error" in shacl_results:
            raise Exception(shacl_results["error"])
        
        all_results["results"]["shacl"] = {
            "status": "success",
            "validation_method": shacl_results.get("validation_method", "SHACL-based"),
            "conforms": shacl_results.get("validation", {}).get("conforms", False),
            "violations_count": shacl_results.get("validation", {}).get("violations_count", 0)
        }
        
        print(f"✓ SHACL Shape Validation: COMPLETED")
        conforms = shacl_results.get("validation", {}).get("conforms", False)
        print(f"  Conformance: {'✓ Yes' if conforms else '✗ No'}")
        all_results["summary"]["successful"] += 1
        
    except Exception as e:
        error_msg = f"SHACL Validation failed: {str(e)}"
        print(f"✗ {error_msg}")
        print(f"  Traceback: {traceback.format_exc()[:200]}")
        all_results["results"]["shacl"] = {
            "status": "failed",
            "error": str(e)
        }
        all_results["summary"]["failed"] += 1
        all_results["summary"]["errors"].append(error_msg)
    
    # ===== VALIDATION 3: ALIGNMENT SENSITIVITY EXPERIMENT =====
    print("\n" + "="*80)
    print("[3/3] ALIGNMENT SENSITIVITY EXPERIMENT")
    print("="*80)
    
    try:
        print("\n⏱️  Running alignment sensitivity experiment...")
        alignment_results = run_alignment_sensitivity_experiment()
        
        if "error" in alignment_results:
            raise Exception(alignment_results["error"])
        
        # Print results summary
        print_alignment_results(alignment_results)
        
        # Save results
        report_path = save_alignment_results(alignment_results)
        
        all_results["results"]["alignment_sensitivity"] = {
            "status": "success",
            "report_path": report_path,
            "summary": {
                "rdf_f1_score": alignment_results.get("methods", {}).get("rdf_based", {}).get("metrics", {}).get("f1_score", 0),
                "json_f1_score": alignment_results.get("methods", {}).get("json_baseline", {}).get("metrics", {}).get("f1_score", 0),
                "rdf_is_better": alignment_results.get("comparison", {}).get("rdf_is_better", False)
            }
        }
        
        print(f"\n✓ Alignment Sensitivity Experiment: COMPLETED")
        print(f"  Report: {report_path}")
        all_results["summary"]["successful"] += 1

        rdf_f1_score = alignment_results["methods"]["rdf_based"]["metrics"]["f1_score"]
        json_f1_score = alignment_results["methods"]["json_baseline"]["metrics"]["f1_score"]
        rdf_metrics = calculate_rdf_validation_metrics(
            rdf_validation_results,
            shacl_results,
            rdf_f1_score,
        )
        json_validation = rdf_validation_results.get('validations', {}).get('json', {})
        json_metrics = {
            'Structure\nPreservation': json_validation.get('structure_preservation_rate'),
            'Schema\nCompleteness': json_validation.get('schema_completeness_score'),
            'Semantic\nEquivalence': json_validation.get('semantic_equivalence_rate'),
            'Class\nPreservation': json_validation.get('class_preservation_rate'),
            # JSON passes equivalent constraints, but JSON itself is not SHACL-conformant.
            'SHACL\nConformance': False,
            'F1 Score': json_f1_score,
        }
        all_results["visualization_metrics"] = {
            "rdf": rdf_metrics,
            "json": json_metrics,
        }
        
    except Exception as e:
        error_msg = f"Alignment Sensitivity Experiment failed: {str(e)}"
        print(f"✗ {error_msg}")
        print(f"  Traceback: {traceback.format_exc()[:200]}")
        all_results["results"]["alignment_sensitivity"] = {
            "status": "failed",
            "error": str(e)
        }
        all_results["summary"]["failed"] += 1
        all_results["summary"]["errors"].append(error_msg)
    
    # ===== FINAL SUMMARY =====
    print("\n" + "="*80)
    print("EXECUTION SUMMARY")
    print("="*80)
    
    print(f"\n📊 Final Results:")
    print(f"  Total validations:    {all_results['summary']['total_validations']}")
    print(f"  Successful:           {all_results['summary']['successful']}")
    print(f"  Failed:               {all_results['summary']['failed']}")
    
    if all_results['summary']['errors']:
        print(f"\n⚠️  Errors encountered:")
        for error in all_results['summary']['errors']:
            print(f"  - {error}")
    
    print(f"\n✓ Validation suite execution completed at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    
    # Save master results
    try:
        results_dir = get_validation_results_dir()
        master_report_path = os.path.join(results_dir, 'master-validation-report.json')
        
        with open(master_report_path, 'w', encoding='utf-8') as f:
            json.dump(all_results, f, indent=2, default=str)
        
        print(f"✓ Master validation report saved to: {master_report_path}")
    except Exception as e:
        print(f"⚠️  Could not save master report: {e}")
    
    print("\n" + "="*80)
    
    # Exit with appropriate code
    if all_results['summary']['failed'] > 0:
        print(f"⚠️  {all_results['summary']['failed']} validation(s) failed")
        return 1
    else:
        print("✓ All validations completed successfully!")
        return 0

if __name__ == "__main__":
    exit_code = main()
    sys.exit(exit_code)
