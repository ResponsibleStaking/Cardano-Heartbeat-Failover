# Cardano-Heartbeat-Failover
AWS based Cloud Service to take Failover Decisions and Client Service to send Heartbeats which include the Node TIP and execute Switchovers.
More details about the Concept are found below in the following sections of this page:

* [Basic-Explanation](##Basic-Explanation)
* [Overview-Diagram](##Overview-Diagram)
* [Detailed-Service-Logic](##Detailed-Service-Logic)


### Installation Steps
1. Deploy the AWS based service as described in [/server](/server)
2. Deploy the client service on your currently active BP as described in [/client](/client)
3. Deploy the client service on the secondary BP which is currently failover





(##Basic-Explanation)
* The Server-side component hosts a simple logic which receives the current TIP of each server.
* The Client service sends the tip in alternating order (bp1, bp2, bp1, bp2, ..)
* Whenever a TIP of a Standby server is coming in the script evaluates if this server should be promoted to be a Master.
* If the TIP is coming in from the current Master it is only persisted. No proactive push away of the Master Status (as the master will anyways not be able to report status if it is down for any reason)
* The evaluation logic is kept very simple:
* The Standby is promoted active when:
* He is OK (Last Tip < 300s). Note: Last tip means that not the newest reported TIP but the last one will be used for the evaluation. If the newest would be used it would trigger a failover if there was no TIP update for a long time (e.g. Epoch Border) and one Node suddenly jumps to TIP 0 again. If he is the first he would be promoted to master immediately. By using the Last tip of the current standby this unneccesary switch is avoided.
* The current Master is not OK (Current Tip > 300s)
* The service responds with the info which status the server shall have
* The client script compares this new status with it's current Status
* If it changed an according switchover script is triggered which modifies the CNODE Configuration and restarts the server.

## Usage
### Daily work
* The service takes care on Reporting the TIP and failing over if needed.
* If you restart your master this should not trigger a failover if the DB is in sync again within 5 minutes (depending on your configuration, 300s default)
* You can trigger a manual switchover. Please note that this will also require some time until the new master is restarted.

### Maintenance Scenario
If you want to upgrade one or both of your BPs and therefore want to manually switch over to avoid any downtime:
* Note: This is relevant if you want to avoid any BP Downtime. If you plan your Downtime in a Block Free time you can also just force a switchover and let the Script handle the switch (with some downtime) before you start your maintenance work.
* Disable the Timer service and Failover manually
* Restart standby as BP and wait until up (TIP OK)
* Stop the current master
* If you plan to also upgrade the other server just continue with a manual switch back (no need to inform the Failover Service as after all of this the same Node will be master again)
* If you plan to keep the old standby the new master inform the failover service by sending a forced switchover signal to avoid switching back
* Activate the Timer service again.


### Forced Switchover
If you want to enforce a switchover you can use the parameter "forceSwitch=1". The other parameters are still required, but the TIP is not persisted, so it can be any value.
Note: A forced switchover is ignoring any wait times or invalid server status. Only use this if you know that the target system is in a healthy state.
Example:
```
?tenant-id=11111111-2222-3333-4444-555555555555&nodeName=bp1&currentTip=36543980&json=1&debug=1&forceSwitch=1
```


(##Overview-Diagram)
![Overview Diagram](/docs/Failover-HighLevel-Flow.png)

(##Detailed-Service-Logic)
![Detailed Service Logic](/docs/Microservice%20Logic.png)

## Theory behind:
- Why using TIP and not just monitor the port?
- Potential other triggers / enhancements of the switchover logic
