from pathlib import Path

# Base Paths
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
PS3_ROOT = PROJECT_ROOT / "PS3"
DATA_DIR = PS3_ROOT / "02_Datasets"
REFS_DIR = PS3_ROOT / "03_References"
SAMPLE_SUBMISSION_DIR = PS3_ROOT / "04_Example_Submission"
OUTPUTS_DIR = PROJECT_ROOT / "outputs"
OUTPUTS_DIR.mkdir(parents=True, exist_ok=True)

# Subsystem Dataset Paths
DOOR_TRAIN_CSV = DATA_DIR / "Door" / "Train.csv"
DOOR_TRAIN_ANSWER = DATA_DIR / "Door" / "Train_Segments_Answer.csv"
DOOR_TEST_CSV = DATA_DIR / "Door" / "Test.csv"

ACV_TRAIN_DIR = DATA_DIR / "ACV" / "Train"
ACV_TRAIN_LABELS = DATA_DIR / "ACV" / "Train_Labels.csv"
ACV_TEST_DIR = DATA_DIR / "ACV" / "Test"

RAIL_TRAIN_DIR = DATA_DIR / "Rail_Corrugation" / "Train"
RAIL_TRAIN_LABELS = DATA_DIR / "Rail_Corrugation" / "Train_Labels.csv"
RAIL_TEST_DIR = DATA_DIR / "Rail_Corrugation" / "Test"

SHM_TRAIN_DIR = DATA_DIR / "SHM" / "Train"
SHM_TRAIN_LABELS = DATA_DIR / "SHM" / "Train_Labels.csv"
SHM_TEST_DIR = DATA_DIR / "SHM" / "Test"

RANDOM_SEED = 42
