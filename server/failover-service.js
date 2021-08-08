//Initialize AWS Context
const AWS = require('aws-sdk')
const dynamoDB = new AWS.DynamoDB({ region: 'eu-west-1', apiVersion: '2012-08-10' })

//Initialize Environment Variables
const ACCEPTED_NODE_NAMES =         process.env.ACCEPTED_NODE_NAMES;
const MIN_SWITCHOVER_INTERVAL =     process.env.MIN_SWITCHOVER_INTERVAL;
const TRESHOLD_NOK_STATUS =         process.env.TRESHOLD_NOK_STATUS;
const TRESHOLD_OK_STATUS =          process.env.TRESHOLD_OK_STATUS;

//Hande the Heartbeat Request and Respond with the currently active Node
exports.handler = (event, context, cb) => {
    //Initialize Accepted Node Names Array
    const aNodes = ACCEPTED_NODE_NAMES.split(",");    //List of all accepted Nodes

    //Define Configuration Variables
    var   configAcceptedNodeNames = "";
    var   configMinSwitchoverInterval = 1;
    var   configTresholdNokStatus = 1;
    var   configTresholdOkStatus = 1;

    //Load and validate configuration Values, parseInt will throw excpetion if not an integer
    var configError = false;
    var errorText = "";
    try {
        configAcceptedNodeNames = ACCEPTED_NODE_NAMES;
        configMinSwitchoverInterval = parseInt(MIN_SWITCHOVER_INTERVAL,10);    if(isNaN(configMinSwitchoverInterval)) {throw "error"}
        configTresholdNokStatus = parseInt(TRESHOLD_NOK_STATUS,10);            if(isNaN(configTresholdNokStatus)) {throw "error"}
        configTresholdOkStatus = parseInt(TRESHOLD_OK_STATUS,10);              if(isNaN(configTresholdOkStatus)) {throw "error"}
    } catch (e) {
        configError = true;
        errorText = "Invalid Configuration. One of the variables is not defined or not an integer: MIN_SWITCHOVER_INTERVAL,TRESHOLD_NOK_STATUS,TRESHOLD_OK_STATUS";
    }

    //Validate if min 2 Nodes are defined in the config
    if ((typeof ACCEPTED_NODE_NAMES  === 'undefined') || (aNodes.length < 2)) {
        configError = true;
        errorText = "Configuration ACCEPTED_NODE_NAMES requires at least 2 entries, e.g. BP1,BP2";
    }

    if (configError) {
        console.error(errorText);
        const errorObject = {"error": errorText};
        const response = {
            "statusCode": 400,
            "body": JSON.stringify(errorObject),
            "headers": {
                "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Credentials": true
            }
        };
        cb(null, response);
    } else {
        //console.log("Configuration: AcceptedNodeNames=" + configAcceptedNodeNames + ",MinSwitchoverInterval=" + configMinSwitchoverInterval + ",TresholdNokStatus=" + configTresholdNokStatus + ",TresholdOkStatus=" + configTresholdOkStatus);

        var paramsError = false;

        //Read URL Parameters
        var paramTenantId =         event["queryStringParameters"]['tenant-id'];
        var paramNodeName =         event["queryStringParameters"]['nodeName'];
        var paramCurrentTipText =   event["queryStringParameters"]['currentTip'];
        var paramCurrentTip =       parseInt(paramCurrentTipText,10);
        var paramDebug =            event["queryStringParameters"]['debug'];
        var paramJson =            event["queryStringParameters"]['json'];
        var paramForceSwitch =            event["queryStringParameters"]['forceSwitch'];

        var isDebug = !(paramDebug == null || paramDebug == "");
        var isJson = !(paramJson == null || paramJson == "");
        var isForceSwitch = !(paramForceSwitch == null || paramForceSwitch == "");
        if (isDebug) console.log("Parameters: tenant-id="+paramTenantId+",nodeName="+paramNodeName+",currentTip="+paramCurrentTip + ",debug="+isDebug + ",json="+isJson+ ",forceSwitch="+isForceSwitch);

        //Validate URL Parameters and return Errors if wrong
        if (paramTenantId === null) {
            paramsError = true;
            errorText = "Parameter tenant-id missing";
        } else if (paramNodeName === null) {
            paramsError = true;
            errorText = "Parameter nodeName missing";
        } else if (!aNodes.includes(paramNodeName)) {
            paramsError = true;
            errorText = "Parameter nodeName contains invalid Node Name";
        } else if (paramCurrentTipText === null) {
            paramsError = true;
            errorText = "Parameter currentTip missing";
        } else if (isNaN(paramCurrentTip)) {
            paramsError = true;
            errorText = "Parameter currentTip is not a number";
        }

        if (paramsError) {
            console.error(errorText);
            const errorObject = {"error": errorText};
            const response = {
                "statusCode": 400,
                "body": JSON.stringify(errorObject),
                "headers": {
                    "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Credentials": true
                }
            };
            cb(null, response);
        } else {
            //Initialize Object to hold previous data
            var currentDataItem = null;

            //Define DynamoDB Read Query
            const paramsRead = {
                TableName: 'server-failover-data',
                Key:  {
                    'tenant-id': {S: paramTenantId}
                }
            };

            //Calculate REF Tip and define Server status based on it
            const refTip = Math.floor(Date.now()/1000 - 1591566291);
            const now = Date.now();
            if (isDebug) console.log("Ref Tip: " + refTip);

            //Fetch current Status from DynamoDB
            dynamoDB.getItem(paramsRead, (err, data) => {
                if (err) {
                    errorText = "cannot read last data";
                    console.error(errorText);
                    const errorObject = {"error": errorText};
                    const response = {
                        "statusCode": 400,
                        "body": JSON.stringify(errorObject),
                        "headers": {
                            "Access-Control-Allow-Origin": "*",
                        "Access-Control-Allow-Credentials": true
                        }
                    };
                    cb(null, response);
                }
                else {
                    //Use the existing Data Item and extend it with potentially missing attributes
                    if (isDebug) console.log("Loaded Existing Data");
                    currentDataItem = AWS.DynamoDB.Converter.unmarshall(data.Item);

                    if (currentDataItem.currentActive == null) {
                        console.warn("Initialize current Active to " + aNodes[0] );
                        currentDataItem.currentActive = aNodes[0];
                    }
                    if (currentDataItem.lastSwitchOver == null) {
                        console.warn("Initialize lastSwitchOver to now: " +now );
                        currentDataItem.lastSwitchOver = now;
                    }
                    aNodes.forEach(function(item){
                        if (currentDataItem["servers-" + item + "-lastTip"] == null) {
                            console.warn("Initialize servers-" + item + "-lastTip to sent Tip (all unitialized servers will have the same tip by that): " + paramCurrentTipText);
                            currentDataItem["servers-" + item + "-lastTip"] = paramCurrentTipText;
                        }
                    });

                    //Persist fresh Tip Data through an update query (to make it available asap for other requests)
                    var updateTipValue = paramCurrentTipText+"";
                    if (isForceSwitch) {
                        //keep the last tip in Force Scenario
                        updateTipValue = currentDataItem["servers-"+paramNodeName+"-lastTip"];
                    }

                    const paramsUpdate = {
                        TableName: 'server-failover-data',
                        Key:  {
                            'tenant-id': {S: paramTenantId}
                        },
                        UpdateExpression: "set #MyVariable = :x ",
                        ExpressionAttributeNames:{
                            "#MyVariable": "servers-"+paramNodeName+"-lastTip"
                        },
                        ExpressionAttributeValues:{
                            ":x": {N: updateTipValue+""}
                        }
                    };
                    dynamoDB.updateItem(paramsUpdate, function(err, data) {
                        if (err) {
                            errorText = "Was not able to persist new TIP data. Abort";
                            console.error(errorText);
                            const errorObject = {"error": errorText};
                            const response = {
                                "statusCode": 400,
                                "body": JSON.stringify(errorObject),
                                "headers": {
                                    "Access-Control-Allow-Origin": "*",
                                "Access-Control-Allow-Credentials": true
                                }
                            };
                            cb(null, response);
                        } else {
                            if (isDebug) console.log("New Tip persisted successfully");

                            if (isDebug) console.log("  Current Active Node: " + currentDataItem.currentActive + ", Last Switchover: " + currentDataItem.lastSwitchOver);

                            //By default the Master will stay the same. Logic below is overwriding in the switchover scenario
                            var newMaster = currentDataItem.currentActive;

                            //check if there es enough time passed since last switchOver
                            var millisSinceLastSwitch = now - currentDataItem.lastSwitchOver;
                            if (isDebug) console.log("  Time since last switch: " + Math.floor(millisSinceLastSwitch/1000) + " seconds");

                            //Validate if a new switch is already possible
                            if (millisSinceLastSwitch/1000 > configMinSwitchoverInterval) {
                                if (isDebug) console.log("  Enough time passed since last switchover, failover theoretical possible: " + Math.floor(millisSinceLastSwitch/1000) + ", Min Required Time Passed: "+ MIN_SWITCHOVER_INTERVAL);

                                //Check if the caller is currently a standby (not the active node)
                                const callerIsStandby = (paramNodeName !== currentDataItem.currentActive);

                                //if I am standby - evaluate if i should takeover (if master is inavailable)
                                if (callerIsStandby) {
                                    if (isDebug) console.log("  Caller is currently Standby - evaluate if it should be promoted to Active");

                                    //Calculate Tip age of Caller (based on the last heartbeat singal, not the newest data)
                                    //We use the old data to avoid that a TIP update after an Epoch change directly leads to a switchover to the server who first runs the heartbeat when the first new slot comes in after long time of no slots
                                    var callerTipAge = refTip - currentDataItem["servers-" + paramNodeName + "-lastTip"];

                                    //check if my TIP is OK
                                     if (callerTipAge <= configTresholdOkStatus) {
                                        if (isDebug) console.log("  Caller TIP is OK - it does qualify for getting active. callerTipAge (from last heartbeat signal, not the current value): " + callerTipAge);

                                        //Calculate Tip age of Master
                                        var masterTip = currentDataItem["servers-" + currentDataItem.currentActive + "-lastTip"];

                                        //Calculate Age of Master Tip
                                        var masterTipAge = refTip - masterTip;

                                        //check if the current master is already NOK
                                        if (masterTipAge > configTresholdNokStatus) {
                                            if (isDebug) console.log("  Master Tip is NOK - SWITCHOVER REQUIRED - masterTipAge " + masterTipAge);

                                            //promote Caller to master
                                            if (isDebug) console.log("  Promoting Caller" + paramNodeName + " to be the new master. Caller Tip Age: " + callerTipAge + ", Master Tip Age: " + masterTipAge );
                                            newMaster = paramNodeName;

                                            console.log("NEWTIP (" + paramNodeName + ":" + paramCurrentTip + "), ACTION=MAKEACTIVE  , SENDER=" + paramNodeName + ", CURRENTACTIVE=" + currentDataItem.currentActive + ", TIMESINCELASTSWITCH=" + Math.floor(millisSinceLastSwitch/1000) + ", NEWTIP=" + paramCurrentTip + ", LASTTIP=" + currentDataItem["servers-" + paramNodeName + "-lastTip"] + ", TIPAGE=" + callerTipAge + ", MASTERTIPAGE=" + masterTipAge);
                                        } else {
                                            if (isDebug) console.log("  Master Tip is OK or WAIT (!NOK) - no need for action - masterTipAge: " + masterTipAge);
                                            console.log("NEWTIP (" + paramNodeName + ":" + paramCurrentTip + "), ACTION=COULDSWITCH , SENDER=" + paramNodeName + ", CURRENTACTIVE=" + currentDataItem.currentActive + ", TIMESINCELASTSWITCH=" + Math.floor(millisSinceLastSwitch/1000) + ", NEWTIP=" + paramCurrentTip + ", LASTTIP=" + currentDataItem["servers-" + paramNodeName + "-lastTip"] + ", TIPAGE=" + callerTipAge + ", MASTERTIPAGE=" + masterTipAge);
                                        }
                                    } else {
                                        if (isDebug) console.log("  Caller TIP is not OK (WAIT or NOK) - it does not qualify for getting active - stop. callerTipAge: " + callerTipAge);
                                        console.log("NEWTIP (" + paramNodeName + ":" + paramCurrentTip + "), ACTION=CANNOTSWITCH, SENDER=" + paramNodeName + ", CURRENTACTIVE=" + currentDataItem.currentActive + ", TIMESINCELASTSWITCH=" + Math.floor(millisSinceLastSwitch/1000) + ", NEWTIP=" + paramCurrentTip + ", LASTTIP=" + currentDataItem["servers-" + paramNodeName + "-lastTip"] + ", TIPAGE=" + callerTipAge + ", MASTERTIPAGE=n/a");
                                    }
                                } else {
                                    if (isDebug) console.log("  Caller is currently Active - not continue as we are not actively pushing away Active Status, someone has to grab it");
                                    console.log("NEWTIP (" + paramNodeName + ":" + paramCurrentTip + "), ACTION=ALREADYACTIVE, SENDER=" + paramNodeName + ", CURRENTACTIVE=" + currentDataItem.currentActive + ", TIMESINCELASTSWITCH=" + Math.floor(millisSinceLastSwitch/1000) + ", NEWTIP=" + paramCurrentTip + ", LASTTIP=" + currentDataItem["servers-" + paramNodeName + "-lastTip"] + ", TIPAGE=n/a, MASTERTIPAGE=n/a");
                                }
                            } else {
                                if (isDebug) console.log("  Stopped as not enough time passed since last switchover. Time passed: " + (millisSinceLastSwitch/1000) + ", Min Required Time Passed: "+ MIN_SWITCHOVER_INTERVAL);
                                console.log("NEWTIP (" + paramNodeName + ":" + paramCurrentTip + "), ACTION=WAIT         , SENDER=" + paramNodeName + ", CURRENTACTIVE=" + currentDataItem.currentActive + ", TIMESINCELASTSWITCH=" + Math.floor(millisSinceLastSwitch/1000) + ", NEWTIP=" + paramCurrentTip + ", LASTTIP=" + currentDataItem["servers-" + paramNodeName + "-lastTip"] + ", TIPAGE=n/a, MASTERTIPAGE=n/a");
                            }

                            if (isForceSwitch) {
                              console.log("Forced switch to: " +paramNodeName);
                              newMaster = paramNodeName;
                            }

                            //If new Master was established persist info
                            if (newMaster != currentDataItem.currentActive) {
                                currentDataItem.currentActive = newMaster;
                                currentDataItem.lastSwitchOver = now;

                                //Persist updated Master info if relevant
                                const paramsUpdate = {
                                    TableName: 'server-failover-data',
                                    Key:  {
                                        'tenant-id': {S: paramTenantId}
                                    },
                                    UpdateExpression: "set currentActive = :x, lastSwitchOver = :y ",
                                    ExpressionAttributeValues:{
                                        ":x": {S: newMaster+""},
                                        ":y": {N: now+""},
                                    }
                                };
                                dynamoDB.updateItem(paramsUpdate, function(err, data) {
                                    if (err)
                                    {
                                        errorText = "cannot updated master info";
                                        console.error(errorText);
                                        const errorObject = {"error": errorText};
                                        const response = {
                                            "statusCode": 400,
                                            "body": JSON.stringify(errorObject),
                                            "headers": {
                                                "Access-Control-Allow-Origin": "*",
                                            "Access-Control-Allow-Credentials": true
                                            }
                                        };
                                        cb(null, response);
                                    } else {
                                        if (isDebug) console.log("Data persisted successfully", data);
                                    }
                                });
                            } else {
                                //Master  was not changed
                            }

                            //Create text for new Server Role
                            var newCallerStatus = "Standby";
                            if (newMaster === paramNodeName)
                            {
                                newCallerStatus = "Active";
                            }
                            if (isDebug) console.log("New Caller Status: " + newCallerStatus);

                            if (isDebug) {
                                var debugInfo = { };

                                aNodes.forEach(function(item){
                                    debugInfo["servers-" + item + "-tipDiff"] = (Math.floor(refTip - currentDataItem["servers-" + item + "-lastTip"]));
                                });


                                debugInfo.timeSinceSwitchover = Math.floor((now-currentDataItem.lastSwitchOver)/1000);

                                var configInfo = { };
                                configInfo.configAcceptedNodeNames = configAcceptedNodeNames;
                                configInfo.configMinSwitchoverInterval = configMinSwitchoverInterval;
                                configInfo.configTresholdNokStatus = configTresholdNokStatus;
                                configInfo.configTresholdOkStatus = configTresholdOkStatus;
                                debugInfo.configInfo = configInfo;

                                currentDataItem.debugInfo=debugInfo;
                            }

                            if (isJson)
                            {
                                const response = {
                                    "statusCode": 200,
                                    "body": JSON.stringify(currentDataItem),
                                    "headers": {
                                        "Access-Control-Allow-Origin": "*",
                    	            "Access-Control-Allow-Credentials": true
                                    }
                                };
                                if (isDebug) console.log(response);
                                cb(null, response);
                            } else {
                                const response = {
                                    "statusCode": 200,
                                    "body": newCallerStatus,
                                    "headers": {
                                        "Access-Control-Allow-Origin": "*",
                    	            "Access-Control-Allow-Credentials": true
                                    }
                                };
                                if (isDebug) console.log(response);
                                cb(null, response);
                            }
                        }
                    });
                }
            });
        }
    }
};
