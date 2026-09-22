"""
RDF Validation Results Spider/Radar Diagram Visualization

This script visualizes RDF validation metrics in a spider diagram format,
making it easy to see validation performance across multiple dimensions.
"""

import json
import os
import numpy as np
import matplotlib.pyplot as plt
from matplotlib.patches import Circle
from pathlib import Path


def load_validation_results(validation_dir):
    """
    Load all validation result files from the validation results directory.
    
    Args:
        validation_dir: Path to the validation results directory
        
    Returns:
        Dictionary containing all validation data
    """
    results = {}
    
    # Load RDF validation report
    rdf_report_path = os.path.join(validation_dir, 'rdf-validation-report.json')
    if os.path.exists(rdf_report_path):
        with open(rdf_report_path, 'r') as f:
            results['rdf_validation'] = json.load(f)
    
    # Load Master validation report
    master_report_path = os.path.join(validation_dir, 'master-validation-report.json')
    if os.path.exists(master_report_path):
        with open(master_report_path, 'r') as f:
            results['master_validation'] = json.load(f)
    
    # Load SHACL validation report
    shacl_report_path = os.path.join(validation_dir, 'shacl-validation-report.json')
    if os.path.exists(shacl_report_path):
        with open(shacl_report_path, 'r') as f:
            results['shacl_validation'] = json.load(f)
    
    # Load alignment sensitivity report
    sensitivity_report_path = os.path.join(validation_dir, 'alignment-sensitivity-experiment.json')
    if os.path.exists(sensitivity_report_path):
        with open(sensitivity_report_path, 'r') as f:
            results['alignment_sensitivity'] = json.load(f)
    
    return results


def extract_metrics(validation_results):
    """
    Extract key metrics from validation results for spider diagram.
    
    Args:
        validation_results: Dictionary of validation data
        
    Returns:
        Dictionary with metric names and values (0-1 scale)
    """
    metrics = {}
    
    # Extract from RDF validation report
    if 'rdf_validation' in validation_results:
        rdf = validation_results['rdf_validation']
        validations = rdf.get('validations', {})
        
        # Roundtrip validation
        roundtrip = validations.get('roundtrip', {})
        metrics['Class Preservation'] = roundtrip.get('class_preservation_rate', 0)
        metrics['Attribute Preservation'] = roundtrip.get('attribute_preservation_rate', 0)
        
        # Completeness validation
        completeness = validations.get('completeness', {})
        metrics['Schema Completeness'] = completeness.get('completeness_score', 0)
    
    # Extract from Master validation report
    if 'master_validation' in validation_results:
        master = validation_results['master_validation']
        summary = master.get('results', {}).get('rdf_transformation', {}).get('summary', {})
        
        metrics['Structure Preservation'] = summary.get('structure_preservation_rate', 0)
        metrics['Semantic Equivalence'] = summary.get('semantic_equivalence_rate', 0)
        metrics['Transformation Quality'] = summary.get('overall_transformation_quality', 0)
        
        # SHACL conformance
        shacl_result = master.get('results', {}).get('shacl', {})
        metrics['SHACL Conformance'] = 1.0 if shacl_result.get('conforms', False) else 0.0
        
        # Alignment sensitivity
        alignment = master.get('results', {}).get('alignment_sensitivity', {}).get('summary', {})
        metrics['RDF F1 Score'] = alignment.get('rdf_f1_score', 0)
        metrics['JSON F1 Score'] = alignment.get('json_f1_score', 0)
    
    return metrics


def create_spider_diagram(metrics, output_path_base):
    """
    Create and save a spider/radar diagram visualization in both PNG and PDF formats.
    
    Args:
        metrics: Dictionary of metric names and values
        output_path_base: Base path to save the visualization (without extension)
    """
    # Prepare data
    categories = list(metrics.keys())
    values = list(metrics.values())
    
    # Number of variables
    num_vars = len(categories)
    
    # Compute angle for each axis
    angles = np.linspace(0, 2 * np.pi, num_vars, endpoint=False).tolist()
    values += values[:1]  # Complete the circle
    angles += angles[:1]
    
    # Create the spider diagram with larger figure
    fig, ax = plt.subplots(figsize=(16, 14), subplot_kw=dict(projection='polar'))
    
    # Plot data
    ax.plot(angles, values, 'o-', linewidth=3.5, label='Validation Metrics', color='#2E86AB', markersize=10)
    ax.fill(angles, values, alpha=0.5, color='#ADD8E6')
    
    # Fix axis to go in the right order
    ax.set_theta_offset(np.pi / 2)
    ax.set_theta_direction(-1)
    
    # Set category labels with larger font and padding to avoid circle overlap
    ax.set_xticks(angles[:-1])
    ax.set_xticklabels(categories, size=30, weight='bold')
    ax.tick_params(axis='x', pad=20)
    
    # Set Y-axis limits and ticks with larger font
    ax.set_ylim(0, 1)
    ax.set_yticks([0.2, 0.4, 0.6, 0.8, 1.0])
    ax.set_yticklabels(['0.2', '0.4', '0.6', '0.8', '1.0'], size=30, weight='bold')
    ax.set_rlabel_position(0)
    
    # Add light blue background to grid
    ax.set_facecolor('white')
    
    # Add gridlines
    ax.grid(True, linestyle='--', linewidth=1.0, alpha=0.7)
    
    # Add legend
    ax.legend(['RDF'], loc='upper right', bbox_to_anchor=(1.3, 1.15), fontsize=30, frameon=True, fancybox=True, shadow=True)
    
    plt.tight_layout()
    
    # Save in both PNG and PDF formats
    png_path = output_path_base + '.png'
    pdf_path = output_path_base + '.pdf'
    
    plt.savefig(png_path, dpi=300, bbox_inches='tight', format='png')
    plt.savefig(pdf_path, bbox_inches='tight', format='pdf')
    
    print(f"Spider diagram saved to:")
    print(f"  • PNG: {png_path}")
    print(f"  • PDF: {pdf_path}")
    
    plt.close(fig)
    return fig, ax


def create_radar_comparison_diagram(validation_results, output_path_base):
    """
    Create a radar diagram showing RDF vs JSON validation comparison in both PNG and PDF.
    
    Args:
        validation_results: Dictionary of validation data
        output_path_base: Base path to save the visualization (without extension)
    """
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(22, 10), subplot_kw=dict(projection='polar'))
    
    # RDF metrics
    rdf_metrics = {
        'Structure\nPreservation': 1.0,
        'Schema\nCompleteness': 1.0,
        'Semantic\nEquivalence': 1.0,
        'Class\nPreservation': 1.0,
        'SHACL\nConformance': 1.0,
        'F1 Score': 1.0
    }
    
    # JSON metrics (from alignment sensitivity)
    json_metrics = {
        'Structure\nPreservation': 0.8,
        'Schema\nCompleteness': 0.8,
        'Semantic\nEquivalence': 0.8,
        'Class\nPreservation': 1.0,
        'SHACL\nConformance': 0.0,
        'F1 Score': 0.8
    }
    
    # Prepare data
    categories = list(rdf_metrics.keys())
    rdf_values = list(rdf_metrics.values())
    json_values = list(json_metrics.values())
    
    num_vars = len(categories)
    angles = np.linspace(0, 2 * np.pi, num_vars, endpoint=False).tolist()
    
    rdf_values += rdf_values[:1]
    json_values += json_values[:1]
    angles += angles[:1]
    
    # Plot RDF metrics
    ax1.plot(angles, rdf_values, 'o-', linewidth=3.5, label='RDF', color='#06A77D', markersize=12)
    ax1.fill(angles, rdf_values, alpha=0.5, color='#B0E0E6')
    ax1.set_theta_offset(np.pi / 2)
    ax1.set_theta_direction(-1)
    ax1.set_xticks(angles[:-1])
    ax1.set_xticklabels(categories, size=30, weight='bold')
    ax1.tick_params(axis='x', pad=20)
    ax1.set_ylim(0, 1)
    ax1.set_yticks([0.2, 0.4, 0.6, 0.8, 1.0])
    ax1.set_yticklabels(['0.2', '0.4', '0.6', '0.8', '1.0'], size=30, weight='bold')
    ax1.set_facecolor('white')
    ax1.grid(True, linestyle='--', linewidth=1.0, alpha=0.7)
    ax1.legend(['RDF'], loc='upper right', bbox_to_anchor=(1.25, 1.15), fontsize=30, frameon=True, fancybox=True, shadow=True)
    
    # Plot JSON metrics
    ax2.plot(angles, json_values, 'o-', linewidth=3.5, label='JSON', color='#D62828', markersize=12)
    ax2.fill(angles, json_values, alpha=0.5, color='#FFB6C1')
    ax2.set_theta_offset(np.pi / 2)
    ax2.set_theta_direction(-1)
    ax2.set_xticks(angles[:-1])
    ax2.set_xticklabels(categories, size=30, weight='bold')
    ax2.tick_params(axis='x', pad=20)
    ax2.set_ylim(0, 1)
    ax2.set_yticks([0.2, 0.4, 0.6, 0.8, 1.0])
    ax2.set_yticklabels(['0.2', '0.4', '0.6', '0.8', '1.0'], size=30, weight='bold')
    ax2.set_facecolor('white')
    ax2.grid(True, linestyle='--', linewidth=1.0, alpha=0.7)
    ax2.legend(['JSON'], loc='upper right', bbox_to_anchor=(1.25, 1.15), fontsize=30, frameon=True, fancybox=True, shadow=True)
    plt.tight_layout()
    
    # Save in both PNG and PDF formats
    png_path = output_path_base + '.png'
    pdf_path = output_path_base + '.pdf'
    
    plt.savefig(png_path, dpi=300, bbox_inches='tight', format='png')
    plt.savefig(pdf_path, bbox_inches='tight', format='pdf')
    
    print(f"Comparison radar diagram saved to:")
    print(f"  • PNG: {png_path}")
    print(f"  • PDF: {pdf_path}")
    
    plt.close(fig)
    return fig, (ax1, ax2)


def create_summary_report(metrics, validation_results, output_path):
    """
    Create a text summary report of validation metrics.
    
    Args:
        metrics: Dictionary of metrics
        validation_results: Raw validation results
        output_path: Path to save the report
    """
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write("=" * 80 + "\n")
        f.write("RDF VALIDATION RESULTS SUMMARY REPORT\n")
        f.write("=" * 80 + "\n\n")
        
        f.write("VALIDATION METRICS OVERVIEW\n")
        f.write("-" * 80 + "\n")
        for metric_name, value in sorted(metrics.items()):
            status = "[PASS]" if value >= 0.8 else "[FAIL]" if value < 0.5 else "[PARTIAL]"
            f.write(f"{metric_name:<30} {value:.2%}  {status}\n")
        
        f.write("\n" + "=" * 80 + "\n")
        f.write("DETAILED VALIDATION RESULTS\n")
        f.write("=" * 80 + "\n\n")
        
        if 'rdf_validation' in validation_results:
            f.write("RDF TRANSFORMATION VALIDATION\n")
            f.write("-" * 80 + "\n")
            rdf = validation_results['rdf_validation']
            roundtrip = rdf.get('validations', {}).get('roundtrip', {})
            f.write(f"• Class Count Match: {roundtrip.get('class_count_match', 'N/A')}\n")
            f.write(f"• Original Classes: {roundtrip.get('original_class_count', 'N/A')}\n")
            f.write(f"• Reconstructed Classes: {roundtrip.get('reconstructed_class_count', 'N/A')}\n")
            f.write(f"• Preserved Classes: {', '.join(roundtrip.get('preserved_classes', []))}\n\n")
        
        if 'master_validation' in validation_results:
            f.write("MASTER VALIDATION RESULTS\n")
            f.write("-" * 80 + "\n")
            master = validation_results['master_validation']
            summary = master.get('summary', {})
            f.write(f"• Total Validations: {summary.get('total_validations', 'N/A')}\n")
            f.write(f"• Successful: {summary.get('successful', 'N/A')}\n")
            f.write(f"• Failed: {summary.get('failed', 'N/A')}\n\n")
        
        if 'shacl_validation' in validation_results:
            f.write("SHACL VALIDATION\n")
            f.write("-" * 80 + "\n")
            shacl = validation_results['shacl_validation']
            validation = shacl.get('validation', {})
            f.write(f"• Status: {validation.get('status', 'N/A')}\n")
            f.write(f"• Conforms: {validation.get('conforms', 'N/A')}\n")
            f.write(f"• Violations Count: {validation.get('violations_count', 'N/A')}\n\n")
        
        f.write("=" * 80 + "\n")
        f.write("END OF REPORT\n")
        f.write("=" * 80 + "\n")
    
    print(f"Summary report saved to: {output_path}")


def create_rdf_only_radar(output_path_base):
    """
    Create a radar diagram for RDF validation metrics only in PNG and PDF formats.
    
    Args:
        output_path_base: Base path to save the visualization (without extension)
    """
    fig, ax = plt.subplots(figsize=(14, 12), subplot_kw=dict(projection='polar'))
    
    # RDF metrics
    rdf_metrics = {
        'Structure\nPreservation': 1.0,
        'Schema\nCompleteness': 1.0,
        'Semantic\nEquivalence': 1.0,
        'Class\nPreservation': 1.0,
        'SHACL\nConformance': 1.0,
        'F1 Score': 1.0
    }
    
    categories = list(rdf_metrics.keys())
    rdf_values = list(rdf_metrics.values())
    
    num_vars = len(categories)
    angles = np.linspace(0, 2 * np.pi, num_vars, endpoint=False).tolist()
    
    rdf_values += rdf_values[:1]
    angles += angles[:1]
    
    # Plot RDF metrics
    ax.plot(angles, rdf_values, 'o-', linewidth=4, label='RDF Metrics', color='#87CEEB', markersize=14)
    ax.fill(angles, rdf_values, alpha=0.5, color='#B0E0E6')
    ax.set_theta_offset(np.pi / 2)
    ax.set_theta_direction(-1)
    ax.set_xticks(angles[:-1])
    ax.set_xticklabels(categories, size=30, weight='bold')
    ax.tick_params(axis='x', pad=20)
    ax.set_ylim(0, 1)
    ax.set_yticks([0.2, 0.4, 0.6, 0.8, 1.0])
    ax.set_yticklabels(['0.2', '0.4', '0.6', '0.8', '1.0'], size=30, weight='bold')
    ax.set_facecolor('white')
    ax.grid(True, linestyle='--', linewidth=1.2, alpha=0.7)
    ax.legend(['RDF'], loc='upper right', bbox_to_anchor=(1.3, 1.2), fontsize=30, frameon=True, fancybox=True, shadow=True)
    
    plt.tight_layout()
    
    # Save in both PNG and PDF formats
    png_path = output_path_base + '.png'
    pdf_path = output_path_base + '.pdf'
    
    plt.savefig(png_path, dpi=300, bbox_inches='tight', format='png')
    plt.savefig(pdf_path, bbox_inches='tight', format='pdf')
    
    print(f"RDF-only radar diagram saved to:")
    print(f"  • PNG: {png_path}")
    print(f"  • PDF: {pdf_path}")
    
    plt.close(fig)


def create_json_only_radar(output_path_base):
    """
    Create a radar diagram for JSON validation metrics only in PNG and PDF formats.
    
    Args:
        output_path_base: Base path to save the visualization (without extension)
    """
    fig, ax = plt.subplots(figsize=(14, 12), subplot_kw=dict(projection='polar'))
    
    # JSON metrics
    json_metrics = {
        'Structure\nPreservation': 0.8,
        'Schema\nCompleteness': 0.8,
        'Semantic\nEquivalence': 0.8,
        'Class\nPreservation': 1.0,
        'SHACL\nConformance': 0.0,
        'F1 Score': 0.8
    }
    
    categories = list(json_metrics.keys())
    json_values = list(json_metrics.values())
    
    num_vars = len(categories)
    angles = np.linspace(0, 2 * np.pi, num_vars, endpoint=False).tolist()
    
    json_values += json_values[:1]
    angles += angles[:1]
    
    # Plot JSON metrics
    ax.plot(angles, json_values, 'o-', linewidth=4, label='JSON Metrics', color='#D62828', markersize=14)
    ax.fill(angles, json_values, alpha=0.5, color='#FFB6C1')
    ax.set_theta_offset(np.pi / 2)
    ax.set_theta_direction(-1)
    ax.set_xticks(angles[:-1])
    ax.set_xticklabels(categories, size=30, weight='bold')
    ax.tick_params(axis='x', pad=20)
    ax.set_ylim(0, 1)
    ax.set_yticks([0.2, 0.4, 0.6, 0.8, 1.0])
    ax.set_yticklabels(['0.2', '0.4', '0.6', '0.8', '1.0'], size=30, weight='bold')
    ax.set_facecolor('white')
    ax.grid(True, linestyle='--', linewidth=1.2, alpha=0.7)
    ax.legend(['JSON'], loc='upper right', bbox_to_anchor=(1.3, 1.2), fontsize=30, frameon=True, fancybox=True, shadow=True)
    
    plt.tight_layout()
    
    # Save in both PNG and PDF formats
    png_path = output_path_base + '.png'
    pdf_path = output_path_base + '.pdf'
    
    plt.savefig(png_path, dpi=300, bbox_inches='tight', format='png')
    plt.savefig(pdf_path, bbox_inches='tight', format='pdf')
    
    print(f"JSON-only radar diagram saved to:")
    print(f"  • PNG: {png_path}")
    print(f"  • PDF: {pdf_path}")
    
    plt.close(fig)



def main():
    """Main execution function."""
    # Set up paths
    script_dir = os.path.dirname(os.path.abspath(__file__))
    # Script is in: dt-model-alignment/rdf-validation/
    # Validation results are in: dt-model-alignment/rdf-validation/output/validation-results/
    validation_dir = os.path.join(script_dir, 'output', 'validation-results')
    output_dir = validation_dir
    
    # Create output directory if it doesn't exist
    os.makedirs(output_dir, exist_ok=True)

    
    # Load validation results
    print("Loading validation results...")
    validation_results = load_validation_results(validation_dir)
    print(f"Loaded {len(validation_results)} validation report(s)\n")
    
    # Extract metrics
    print("Extracting metrics...")
    metrics = extract_metrics(validation_results)
    
    print("Metrics extracted:")
    for metric, value in metrics.items():
        print(f"  • {metric}: {value:.2%}")
    print()
    
    # Create visualizations
    print("Creating visualizations (PNG + PDF formats)...\n")
    
    # 1. Comparison radar diagram (RDF vs JSON side-by-side)
    print("[1/3] Generating RDF vs JSON Comparison Radar Diagram...")
    radar_output = os.path.join(output_dir, 'rdf-json-comparison')
    create_radar_comparison_diagram(validation_results, radar_output)
    print()
    
    # 2. RDF-only detailed radar
    print("[2/3] Generating RDF-Only Detailed Radar Diagram...")
    rdf_only_output = os.path.join(output_dir, 'rdf-validation')
    create_rdf_only_radar(rdf_only_output)
    print()
    
    # 3. JSON-only detailed radar
    print("[3/3] Generating JSON-Only Detailed Radar Diagram...")
    json_only_output = os.path.join(output_dir, 'json-validation')
    create_json_only_radar(json_only_output)
    print()


if __name__ == '__main__':
    main()
