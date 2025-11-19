## Heterogeneous Model Alignment in Digital Twin 

This repository demonstrates heterogeneous model alignment in **a multi-layered, model-driven digital twin (DT)** architecture, supporting both rigid and flexible conformance to ensure semantic consistency, interoperability, and adaptability. Submitted to a conference, it provides source code, datasets, and documentation for the air quality use case set up.

It also includes reproducible experiments for:

- Exploiting the capabilities of **[Javascript Modeling Framework (JSMF)](https://js-mf.github.io/)** to design and align **multi-layered, model-driven DT** by enabling both rigid and relaxed conformance across abstraction layers, i.e., data, model and metamodel.  
- Presenting a semantics and structure-aware metamodel ontology matching (**SSM-OM**) method that integrates metamodels with domain ontologies, ensuring consistency, accuracy, and domain relevance in DT representations. 
- Demonstrating the practicality of our approach through air quality use case and evaluate its performance using different test cases from **[OAEI tracks](https://oaei.ontologymatching.org/)**.

### Air Quality Usecase 

Air quality in a room is closely related to the concentration of occupants and the potential spread of viruses, making it important for organizations to monitor and manage it to ensure safety and productivity. Key metrics include CO₂ levels, humidity, and temperature, and exceeding defined thresholds can negatively impact people in the space.

In the baseline system, a **Building** consists of multiple **Rooms**, each equipped with **Controllers** connected to **Sensors** (to monitor air quality) and **Alarms** (to notify occupants). Detecting threshold violations allows the system to take appropriate measures to maintain healthy indoor air quality. Airquality use case is adapted from **[here](https://github.com/derlehner/IndoorAirQuality_DigitalTwin_Exemplar)**. We integrated and mapped an **[air quality dataset](https://doi.org/10.17605/OSF.IO/BAEW7)** of 2.5 million one-minute samples from 10 sensors to the DT structure for studying heterogeneous model alignment and semantic consistency across all layers.


### Project Hierarchy
Below is folder structure for project:
```
dt-model-alignment/
│
├── data-layer/                          # DT Data Layer for Air Quality Usecase Setup (Historical and New Data)
├── evaluation/                          # Experiment related to Evaluation of SSM-OM on OAEI Testcases
├── model-metamodel-layer/               # DT Model and Metamodel Layer for Air Quality Usecase Setup
│   ├── metamodel-flexibility.js              # Change Adaptation
│   └── model-metamodel.js                    # DT Model-Metamodel layer 
├── node modules                           
├── ontology-layer/                      # DT ontology Layer for Air Quality Usecase Setup                             
│   └── metamodel-ontology-matching.py         # Semantic and Structure-aware Metamodel Ontology Matching (SSM-OM)
├── output/                               # Results in .csv files for all experiments for matching tasks
├── testcases/                            # OAEI Testcases Used for Evaluation
├── .gitattributes 
└── README.md
└── package.json
└── package-lock.json
└── requirement.txt
```
### Installation
Follow are steps to set up and run this project locally.

#### 1. Clone Repository
```bash
git clone https://github.com/faimaAbbasi/dt-model-alignment.git
cd dt-model-alignment
```

#### 2. Virtual Environment
In order not to conflict with already installed packages on your machine, it is recommended to use a virtual environment (e.g. **[venv](https://docs.python.org/3/library/venv.html)**) for reproducibility. 
```bash
python -m venv venv
```
Activate virtual environment on Windows:
```bash
venv\Scripts\activate
```
On Linux:
```bash
source venv/bin/activate
```

#### 3. Install Required Packages
We recommend using ```Python 3.12.2```. Make sure your ```requirements.txt``` file is in the project’s root folder, then run:
```bash
pip install -r requirement.txt
```
For npm
```npm
npm install
```
### Usage and Examples
To set up the DT model-metamodel layer for the air quality use case with data, run the following file:
```bash
cd model-metamodel-layer
node model-metamodel.js      
```
Below is a simple example illustrating the ```Controller``` concept in the air quality metamodel using JSMF constructs. See <a href='model-metamodel-layer/model-metamodel.js'> model-metamodel.js </a> for details:
```python
const Model = JSMF.Model;
const Class = JSMF.Class;
const airquality = new Model("Airquality-MM");

const Controller = Class.newInstance("Controller");
Controller.addAttribute("id", String);
Controller.setDescription("A device managing sensors and alarms.")

Controller.setReference("alarms", Alarm, JSMF.Cardinality.any);
Controller.setReference("tempsensors", TempSensor, JSMF.Cardinality.any);
airquality.setModellingElements([Building, Room, TempSensor, Proximity, HumiditySensor, PressureSensor, Controller, Alarm]);     
```
The example below illustrates bottom-up change management in the metamodel. Note that changes first occur in the data, which then trigger updates in the model and metamodel layers in DT. Details are in **<a href='model-metamodel-layer/metamodel-flexibility.js'> metamodel-flexibility.js </a>**
```python
airquality.Controller.setFlexible(true)

const controller1=airquality.Controller.newInstance()
controller1.id=row.Controller_id
controller1.load_level=row.load_level # new attribute appeared in data
airquality_model.setModellingElements([controller1]);

const res = discoverer.archetypalDiscovery("Controller", controller1, airquality.Controller)
discoverer.updateClass(airquality.Controller,res)    
```
To set up DT ontology layer and map metamodel to traget **[Brick](https://brickschema.org/)** ontology, for air quality usecase using **SSM-OM**, execute the following file:
```bash
cd ontology-layer
python metamodel-ontology-matching.py     
```
To evaluate the performance of **SSM-OM** on different test cases from **[OAEI tracks](https://oaei.ontologymatching.org/)** tracks, run the scripts in the **[evaluation](evaluation)** folder for each test case. The test cases themselves are available in **[testcases](testcases)** folder. A simple execution example is shown below:
```bash
cd evaluation
python anatomy-track-ontology-mapping.py     
```









