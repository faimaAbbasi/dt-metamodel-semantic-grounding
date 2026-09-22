from sklearn.metrics import precision_score, recall_score, f1_score
import csv
import xml.etree.ElementTree as ET
import tempfile
import tarfile
import os 
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

def evaluate_alignments(predicted_csv_path, reference_alignments):
    predicted_alignments = set()

    # Read predicted alignments from CSV
    with open(predicted_csv_path, 'r', encoding='utf-8') as f:
        reader = csv.reader(f)
        next(reader)  
        for row in reader:
            source_uri, target_uri = row[0].strip(), row[1].strip()
            predicted_alignments.add((source_uri, target_uri))

    reference_alignments = set(reference_alignments)

    # Compute TP, FP, FN
    tp = predicted_alignments & reference_alignments
    fp = predicted_alignments - reference_alignments
    fn = reference_alignments - predicted_alignments

    # Build binary lists for metrics
    y_true = []
    y_pred = []

    all_pairs = reference_alignments | predicted_alignments
    for pair in all_pairs:
        y_true.append(1 if pair in reference_alignments else 0)
        y_pred.append(1 if pair in predicted_alignments else 0)

    precision = precision_score(y_true, y_pred)
    recall = recall_score(y_true, y_pred)
    f1 = f1_score(y_true, y_pred)

    return {
        "true_positives": list(tp),
        "false_positives": list(fp),
        "false_negatives": list(fn),
        "precision": precision,
        "recall": recall,
        "f1_score": f1
    }
    
def parse_reference_alignment(file_path):
    tree = ET.parse(file_path)
    root = tree.getroot()
    alignments = []
    for cell in root.findall('.//{http://knowledgeweb.semanticweb.org/heterogeneity/alignment}Cell'):
        e1 = cell.find('{http://knowledgeweb.semanticweb.org/heterogeneity/alignment}entity1')
        e2 = cell.find('{http://knowledgeweb.semanticweb.org/heterogeneity/alignment}entity2')
        if e1 is not None and e2 is not None:
            src = e1.attrib.get('{http://www.w3.org/1999/02/22-rdf-syntax-ns#}resource')
            tgt = e2.attrib.get('{http://www.w3.org/1999/02/22-rdf-syntax-ns#}resource')
            alignments.append((src, tgt))
    return alignments

def main():
    reference_alignments = parse_reference_alignment(REF_ALIGNMENT_PATH)
    results = evaluate_alignments('../output/common-kg-2/yago-wikidata-mappings.csv', reference_alignments)
    print("TP:", len(results["true_positives"]), "\n")
    print("FP:", len(results["false_positives"]), "\n")
    print("FN:", len(results["false_negatives"]), "\n")
    print(f"Precision: {results['precision']:.4f}\n")
    print(f"Recall: {results['recall']:.4f}\n")
    print(f"F1 Score: {results['f1_score']:.4f}\n")
    
main()
