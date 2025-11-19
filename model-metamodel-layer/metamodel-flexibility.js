const fs = require("fs");
const csv = require("csv-parser");
const unzipper = require("unzipper");
const should = require("should");
const discoverer = require("jsmf-core/src/indexDiscovery");
const { Cardinality } = require("jsmf-core/src/Cardinality");

const {
    MM,
    M,
    getInstances,
    getElement,
    addElement,
    doesEntityExist,
    save_metamodel,
} = require("../model-metamodel-layer/model-metamodel.js");

// ******************* Update Metamodel Function *************************** 

function updateMetamodel(instance, classType, className) {
    const res = discoverer.archetypalDiscovery(className, instance, classType);
    discoverer.updateClass(MM.Controller, res);
    console.log("\n Controller Class After Update:", classType.attributes);
}
let rowCount = 0;
fs.createReadStream("../data-layer/newdata.zip")   
    .pipe(unzipper.Parse())
    .on("entry", (entry) => {
        const fileName = entry.path;
        if (fileName.endsWith("newdata.csv")) {
            entry
                .pipe(csv())
                .on("data", (row) => {
                    if (rowCount < 1) {
                        const building = MM.Building.newInstance();
                        building.id = row.Building_id;

                        const room = MM.Room.newInstance();
                        room.id = row.Room_id;

                        const tempSensor = MM.TempSensor.newInstance();
                        tempSensor.value = parseFloat(row.temperature);
                        tempSensor.unit = row.temperature_unit;

                        const humSensor = MM.HumSensor.newInstance();
                        humSensor.value = parseFloat(row.humidity);
                        humSensor.unit = row.humidity_unit;

                        const proxSensor = MM.ProxSensor.newInstance();
                        proxSensor.value = parseFloat(row.proximity);
                        proxSensor.unit = row.proximity_unit;

                        // Allow flexible attributes for new Controller fields
                        MM.Controller.setFlexible(true);

                        // Discover the dynamic attribute
                        const keys = Object.keys(row);
                        const attribute = keys.find((k) =>
                            k.includes("load_level")
                        );
                        console.log(
                            "Controller Class Set Flexible. New Attribute Discovered:",
                            attribute
                        );

                        const controller = MM.Controller.newInstance();
                        controller.id = row.Controller_id;

                        if (attribute) controller[attribute] = row[attribute];

                        const alarm = MM.Alarm.newInstance();
                        alarm.isActive =
                            row.IsActive?.toLowerCase() === "true";

                        // -----------------------------
                        // Relationships
                        // -----------------------------
                        building.rooms = room;
                        room.controllers = controller;
                        controller.alarms = alarm;
                        controller.tempsensors = tempSensor;
                        controller.humsensors = humSensor;
                        controller.proximitySensor = proxSensor;

                        const instances = [
                            building,
                            room,
                            controller,
                            tempSensor,
                            humSensor,
                            proxSensor,
                            alarm,
                        ];

                        // Add to model
                        M.setModellingElements(instances);

                        // Update metamodel
                        updateMetamodel(controller, MM.Controller, "Controller");
                        rowCount++;
                    }
                })
                .on("end", () => {
                    console.log("Finished processing newdata.csv");
                })
                .on("error", (err) =>
                    console.error("Error parsing CSV:", err)
                );
        } else {
            // Ignore all other files inside ZIP
            entry.autodrain();
        }
    })
    .on("close", () => {
        console.log("ZIP extraction complete.");
    })
    .on("error", (err) => {
        console.error("Error extracting ZIP:", err);
    });




