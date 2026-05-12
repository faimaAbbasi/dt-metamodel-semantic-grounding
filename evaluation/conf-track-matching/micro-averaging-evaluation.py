from sklearn.metrics import precision_score, recall_score, f1_score
import csv
import xml.etree.ElementTree as ET
import os
import tarfile
import tempfile

def load_ontology_from_tar(tar_path, internal_filename):
    """
    Extracts a file from a TAR archive into a temporary folder
    and returns the temporary path so RDFlib can read it.
    """
    temp_dir = tempfile.mkdtemp()

    with tarfile.open(tar_path, "r") as tar:
        member = tar.getmember(internal_filename)
        tar.extract(member, temp_dir)

    extracted_path = os.path.join(temp_dir, internal_filename)
    return extracted_path

def evaluate_alignments(predicted_csv_path, reference_alignments):
    predicted_alignments = set()

    # Read predicted alignments from CSV
    with open(predicted_csv_path, 'r', encoding='utf-8') as f:
        reader = csv.reader(f)
        next(reader)  # skip header
        for row in reader:
            source_uri, target_uri = row[0].strip(), row[1].strip()
            predicted_alignments.add((source_uri, target_uri))

    reference_alignments = set(reference_alignments)

    tp = predicted_alignments & reference_alignments
    fp = predicted_alignments - reference_alignments
    fn = reference_alignments - predicted_alignments

    # Create binary label lists
    y_true = []
    y_pred = []
    all_pairs = reference_alignments | predicted_alignments
    for pair in all_pairs:
        y_true.append(1 if pair in reference_alignments else 0)
        y_pred.append(1 if pair in predicted_alignments else 0)

    precision = precision_score(y_true, y_pred, zero_division=0)
    recall = recall_score(y_true, y_pred, zero_division=0)
    f1 = f1_score(y_true, y_pred, zero_division=0)

    return {
        "tp": tp,
        "fp": fp,
        "fn": fn,
        "precision": precision,
        "recall": recall,
        "f1": f1,
        "y_true": y_true,
        "y_pred": y_pred
    }

def parse_reference_alignment(file_path):
    ns = {
        'align': 'http://knowledgeweb.semanticweb.org/heterogeneity/alignment#',
        'rdf': 'http://www.w3.org/1999/02/22-rdf-syntax-ns#'
    }

    tree = ET.parse(file_path)
    root = tree.getroot()
    alignments = []

    for cell in root.findall('.//align:Cell', ns):
        e1 = cell.find('align:entity1', ns)
        e2 = cell.find('align:entity2', ns)
        if e1 is not None and e2 is not None:
            src = e1.attrib.get('{http://www.w3.org/1999/02/22-rdf-syntax-ns#}resource')
            tgt = e2.attrib.get('{http://www.w3.org/1999/02/22-rdf-syntax-ns#}resource')
            if src and tgt:
                alignments.append((src, tgt))

    return alignments

def main():
    TAR_PATH = "../../testcases/conf-track.tar"
    file_pairs = [
        # Add your (prediction_file, reference_file) pairs here
        ('../../output/conf-track/dbpedia-ConfOf-mappings.csv', 
          load_ontology_from_tar(TAR_PATH, "conf-track/dbpedia-ConfOf-ref.rdf")),
        
        ('../../output/conf-track/dbpedia-ekaw-mappings.csv', 
         load_ontology_from_tar(TAR_PATH, "conf-track/dbpedia-ekaw-ref.rdf")),
        
        ('../../output/conf-track/dbpedia-sigkdd-mappings.csv', 
         load_ontology_from_tar(TAR_PATH, "conf-track/dbpedia-sigkdd-ref.rdf"))
    ]

    total_y_true = []
    total_y_pred = []

    print("---- Per-task Scores ----\n")

    for pred_path, ref_path in file_pairs:
        reference_alignments = parse_reference_alignment(ref_path)
        result = evaluate_alignments(pred_path, reference_alignments)

        print(f"Task: {pred_path.split('/')[-1]} vs {ref_path.split('/')[-1]}")
        print(f"TP: {len(result['tp'])}, FP: {len(result['fp'])}, FN: {len(result['fn'])}")
        print(f"Precision: {result['precision']:.4f}, Recall: {result['recall']:.4f}, F1: {result['f1']:.4f}\n")

        total_y_true.extend(result['y_true'])
        total_y_pred.extend(result['y_pred'])

    print("---- Micro-Averaged Scores ----\n")
    micro_precision = precision_score(total_y_true, total_y_pred, zero_division=0)
    micro_recall = recall_score(total_y_true, total_y_pred, zero_division=0)
    micro_f1 = f1_score(total_y_true, total_y_pred, zero_division=0)

    print(f"Micro Precision: {micro_precision:.4f}")
    print(f"Micro Recall:    {micro_recall:.4f}")
    print(f"Micro F1 Score:  {micro_f1:.4f}")

main()
