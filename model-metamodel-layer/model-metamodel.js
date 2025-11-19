const fs = require("fs");
const JSMF = require('jsmf-core'),
      nav = require('jsmf-magellan')
const csv = require("csv-parser");
const N3 = require('n3');
const tar = require("tar-stream");
const unzipper = require("unzipper");
const { Cardinality } = require('jsmf-core/src/Cardinality')

// ******************* JSMF Constructs *************************** 

const Model = JSMF.Model;
const Class = JSMF.Class;

// ******************* Metamodel Layer *************************** 

const airquality = new Model('Airquality-MM');

const Building = Class.newInstance('Building');
Building.addAttribute('id', String);
Building.setDescription('A structure with a roof and walls, such as a house or factory.')

const Room = Class.newInstance('Room');
Room.addAttribute('id', String);
Room.setDescription('An enclosed space within a building.')

const TempSensor = Class.newInstance('TemperatureSensor');
TempSensor.addAttribute('value', Number);
TempSensor.addAttribute('unit', String);
TempSensor.setDescription('A sensor used for measuring temperature.')

const HumSensor = Class.newInstance('HumiditySensor');
HumSensor.addAttribute('value', Number);
HumSensor.addAttribute('unit', String);
HumSensor.setDescription('A sensor used for measuring humidity.')

const ProxSensor = Class.newInstance('ProximitySensor');
ProxSensor.addAttribute('value', Number);
ProxSensor.addAttribute('unit', String);
ProxSensor.setDescription('A sensor used for measuring distance to nearby objects.')

const Controller = Class.newInstance('Controller');
Controller.addAttribute('id', String);
Controller.setDescription('A device that manages connected sensors and alarms.')

const Alarm = Class.newInstance('Alarm');
Alarm.addAttribute('isActive', Boolean);
Alarm.setDescription('A device indicating an alert (on/off).')

Building.setReference('rooms', Room, -1);
Room.setReference('controllers', Controller, -1);
Controller.setReference('alarms', Alarm, -1);
Controller.setReference('tempsensors', TempSensor, -1);
Controller.setReference('humsensors', HumSensor, -1);
Controller.setReference('proximitySensor', ProxSensor, -1);


airquality.setModellingElements([Building, Room, TempSensor, HumSensor, ProxSensor, Controller, Alarm]);

const airquality_model = new Model("Model", airquality);

// ******************* Data & Model Layer *************************** 

const instances = [];

function processCSV() {
    return new Promise((resolve, reject) => {
        let rowCount = 0;
        fs.createReadStream("../data-layer/historicaldata.zip")
            .pipe(unzipper.Parse())
            .on("entry", (entry) => {
                const fileName = entry.path;
                if (fileName.endsWith("historicaldata.csv")) {
                    entry
                        .pipe(csv())
                        .on("data", (row) => {
                            if (rowCount < 10) {
                                const building = Building.newInstance();
                                building.id = row.Building_id;

                                const room = Room.newInstance();
                                room.id = row.Room_id;

                                const controller = Controller.newInstance();
                                controller.id = row.Controller_id;

                                const tempSensor = TempSensor.newInstance();
                                tempSensor.value = parseFloat(row.temperature);
                                tempSensor.unit = row.temperature_unit;

                                const humSensor = HumSensor.newInstance();
                                humSensor.value = parseFloat(row.humidity);
                                humSensor.unit = row.humidity_unit;

                                const proxSensor = ProxSensor.newInstance();
                                proxSensor.value = parseFloat(row.proximity);
                                proxSensor.unit = row.proximity_unit;

                                const alarm = Alarm.newInstance();
                                alarm.isActive = row.IsActive?.toLowerCase() === "true";

                                building.rooms = room;
                                room.controllers = controller;
                                controller.alarms = alarm;
                                controller.tempsensors = tempSensor;
                                controller.humsensors = humSensor;
                                controller.proximitySensor = proxSensor;

                                instances.push(
                                    building,
                                    room,
                                    controller,
                                    tempSensor,
                                    humSensor,
                                    proxSensor,
                                    alarm
                                );

                                airquality_model.setModellingElements(instances);
                                rowCount++;
                            }
                        })
                        .on("end", () => {
                            entry.autodrain();
                        })
                        .on("error", reject);

                } else {
                    entry.autodrain();
                }
            })
            .on("close", resolve)
            .on("error", reject);
    });
}

// ******************* Utilities *************************** 
async function getInstances() {
    try {
        await processCSV();
        const build = nav.allInstancesFromModel(Building, airquality_model);
        build.forEach(slot => {
            console.log(`Building - Id: ${slot.id}`);
        });
        const room = nav.allInstancesFromModel(Room, airquality_model);
        room.forEach(slot => {
            console.log(`Room - Id: ${slot.id}`);
        });
        const cont = nav.allInstancesFromModel(Controller, airquality_model);
        cont.forEach(slot => {
            console.log(`Controller - Id: ${slot.id}`);
        });
        const hum = nav.allInstancesFromModel(HumSensor, airquality_model);
        hum.forEach(slot => {
            console.log(`Temperature Sensor - Unit: ${slot.unit}, Value: ${slot.value}`);
        });
        const temp = nav.allInstancesFromModel(TempSensor, airquality_model);
        temp.forEach(slot => {
            console.log(`Humidity Sensor - Unit: ${slot.unit}, Value: ${slot.value}`);
        });
        const prox = nav.allInstancesFromModel(ProxSensor, airquality_model);
        prox.forEach(slot => {
            console.log(`Proximity Sensor - Unit: ${slot.unit}, Value: ${slot.value}`);
        });
        const alarm = nav.allInstancesFromModel(Alarm, airquality_model);
        alarm.forEach(slot => {
            console.log(`Alarm - State: ${slot.isActive}`);
        });
        console.log("First 5 rows processed and instances added to the model!");
    } catch (error) {
        console.error("Error processing CSV:", error);
    }
}

function addElement(className, cattr, inRefs=[], outRefs=[], mapping, desc) {
    if (!Class || typeof Class.newInstance !== 'function') {
        console.error("Class is undefined or does not have newInstance method");
        return;
    }
    const cls = JSMF.Class.newInstance(className);
    Object.entries(cattr).forEach(([key, { type }]) => {
        if (typeof type === "function") {
            cls.addAttribute(key, type); 
            cls.__description=desc
            cls.setSemanticReference(mapping)
        } else {
            console.warn(`Invalid type for attribute '${key}', expected a function but got:`, type);
        }
    });
    airquality.setModellingElements([cls]);
    console.log('\n Updated Metamodel\n', className + " added with attributes:", cattr);
    inRefs.forEach(({ ref, refName, card }) => {
        if (ref && ref.setReference) {
            ref.setReference(refName, cls, card);
        } else {
            console.warn(`Invalid incoming reference: ${refName}`);
        }
    });

    outRefs.forEach(({ ref, refName, card }) => {
        if (ref && ref.setReference) {
            cls.setReference(refName, ref, card);
        } else {
            console.warn(`\nInvalid outcoming reference: ${refName}`);
        }
    });
    return cls
}


function getElement(className){
    cls=airquality.classes[className] ? airquality.classes[className][0] : null
    return cls
}

function getAllElements(){
    console.log(airquality.elements())
}

function doesElementExist(className) {
    classNames=airquality.elements().map(cls => cls.__name)
    return classNames.includes(className); 
  }

function loadSemanticMappings(csvFilePath) {
    return new Promise((resolve, reject) => {
        const mappings = {};
        fs.createReadStream(csvFilePath)
            .pipe(csv({ mapHeaders: ({ header }) => header.trim() })) // Normalize headers
            .on('data', (row) => {
                const sourceURI = row.source_class_uri?.trim();
                const targetURI = row.target_class_uri?.trim();

                const match = sourceURI?.match(/#(.+)$/);
                if (match && targetURI) {
                    const className = match[1].trim();
                    mappings[className] = {
                        ontology_uri: targetURI
                    };
                }
            })
            .on('end', () => {
                resolve(mappings);
            })
            .on('error', (err) => reject(err));
    });
}

function setSemanticReferences(modelElements, semanticMappings) {
    modelElements.forEach(element => {
        
        const name = element.__name;
        const mapping = semanticMappings[name];
        if (mapping && mapping.ontology_uri) {
            element.__semanticReference = mapping.ontology_uri; 

        } else {
            console.warn(`No semantic mapping found for ${name}`);
        }
    });
}

function save_metamodel(name) {
    const path = require('path');
    const classes = airquality.elements(); 

    const source_model_json = Object.values(classes).map(cls => {
       const className = cls.__name;  
       const desc=cls.__description;
       // This is called when JSON format is generated with semantic reference
       //const ref=cls.__semanticReference;

       const primitive_attributes = Object.entries(cls.attributes).map(([name, attr]) => {
        // attr.type is a JavaScript constructor like String, Number
        const typeName = typeof attr.type === 'function' ? attr.type.name : 'Unknown';
        return `${name}: ${typeName}`;
        });

        const reference_attributes = Object.entries(cls.references).map(([name, ref]) => {
            const refType = ref.type?.__name || 'Unknown';
            return `${name}: ${refType +'[]'}`;
        });

        return {
            name: className,
            primitive_attributes,
            reference_attributes,
            description: desc || '', 
            // This is called when JSON format is generated with semantic reference
            //semanticReference: ref || '',

        };
    });

    const outputPath = path.join(__dirname, '..', 'output', name);
    fs.writeFileSync(outputPath, JSON.stringify(source_model_json, null, 4), 'utf8');
    console.log('✅ Generated ', outputPath);
}

// ******************* Integrates Data with Model Layer ***************************
getInstances()

// ******************* Saves Metamodel in JSON Format *************************** 
save_metamodel("metamodel.json")

// ******************* Metamodel-Ontology Alignment *************************** 

// This is called when JSON format is generated with semantic reference, when metamodel is mapped to ontology.

// const path = require('path');
// const csvPath = path.join(__dirname, '..', 'output', 'metamodel-ontology-mappings.csv');
// const modelElements = airquality.elements(); 
// //console.log(modelElements)
// loadSemanticMappings(csvPath)
//      .then((semanticMappings) => {
//          setSemanticReferences(modelElements, semanticMappings);
//          save_metamodel('metamodel-v1.json')
//          //getInstances()
//          //call all utility functions here
//      })
//      .catch((err) => {
//          console.error("Failed to load semantic mappings:", err);
//      });



// ******************* Exporting Metamodel & Utilities *************************** 
module.exports = {MM: {
    Building,
    Room,
    TempSensor,
    HumSensor,
    ProxSensor,
    Controller,
    Alarm
  }, M: airquality_model, getInstances, addElement, getElement, doesElementExist, save_metamodel, getAllElements}

