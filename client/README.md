# Client-Side Part
The Client Part consists of 2 pieces
1. A set of Script which takes care and reporting heartbeat signals, fetch the proposed server role and apply it if it changed.
2. A Service which is timed to call the below script every N seconds


## Install the Scripts
First we need to install the scripts which take care about reporting the signal and

Create a folder where the new scripts should be placed
```
mkdir -p /opt/cardano/cnode/custom
cd /opt/cardano/cnode/custom
```

Download the draft scripts into this folder
```
sudo wget https://raw.githubusercontent.com/ResponsibleStaking/Cardano-Heartbeat-Failover/main/client/scripts/heartbeat-failover.sh
sudo wget https://raw.githubusercontent.com/ResponsibleStaking/Cardano-Heartbeat-Failover/main/client/scripts/heartbeat-failover-makeActive.sh
sudo wget https://raw.githubusercontent.com/ResponsibleStaking/Cardano-Heartbeat-Failover/main/client/scripts/heartbeat-failover-makeStandby.sh
```
Make sure the scripts are executeable through for the owner only
```
sudo chmod 700 heartbeat-failover.sh
sudo chmod 700 heartbeat-failover-makeActive.sh
sudo chmod 700 heartbeat-failover-makeStandby.sh
```

Make sure the scripts are owned by root and are not editable for anyone else.
Note: This is required because the scripts will be used to change firewall rules which requires root access. To avoid manipulation of the script (which is automatically triggered by a service) laterwards nobody else should be allowed to manipulate the script
```
sudo chown root heartbeat-failover.sh
sudo chown root heartbeat-failover-makeActive.sh
sudo chown root heartbeat-failover-makeStandby.sh
```

## Configure the Scripts
Open the main script
```
sudo nano heartbeat-failover.sh
```

Edit the configuration section in the top of the file to meet your environment
```
CARDANO_CLI_PATH=/home/USER/.cabal/bin/cardano-cli        #Set the name which was used for Installing CNODE. - e.g. /home/YOUR-USERNAME/.cabal/bin/cardano-cli
                                                          #Make sure to replace YOUR-USER
FAILOVER_SCRIPT_ROOT=/opt/cardano/cnode/custom            #The folder where this script is placed

FAILOVER_SERVICE_HEARTBEAT_URL=                           #AWS Endpoint URL of the service. e.g. https://abcdefghij.execute-api.eu-west-1.amazonaws.com/production/failover-service
FAILOVER_SERVICE_TENANT_ID=                               #Generate a UUID for your environment here: https://www.uuidgenerator.net/
FAILOVER_SERVICE_AUTH_TOKEN=                              #AWS Auth Token
FAILOVER_SERVICE_NODE_NAME=                               #This Name needs to be reflected in the Environment Variables of the AWS Lambda function
```

Open the Activation and deactivation scripts.
Note: This files are called by the main script if the server needs to switch to a new State
Note: They need to be customised for you purpose.
Note: In the example I use ufw to enable or disable access to this Server. This will avoid that the Relays are fetching new Blocks which are produced by this Server.
```
sudo nano heartbeat-failover-makeActive.sh
sudo nano heartbeat-failover-makeStandby.sh
```

Test the Standby Script
```
sudo ./heartbeat-failover-makeStandby.sh

# Making Standby
```

Test the Activation Script
```
sudo ./heartbeat-failover-makeActive.sh

# Making Active
```

Test the failover scripts
```
sudo ./heartbeat-failover.sh

# Sending Heartbeat signal for server bp1: 36593029
# cat: /opt/cardano/cnode/custom/heartbeat-failover.active: Datei oder Verzeichnis nicht gefunden
# Last Status:
# New Status: Active
# Status changed
# Switch to Active
# making Active
```

## Install the Service
Create a new System Service which is triggered by a timmer

Switch to the services folder
```
cd /etc/systemd/system
```

Download the Service scripts
```
sudo wget https://raw.githubusercontent.com/ResponsibleStaking/Cardano-Heartbeat-Failover/main/client/system/failover-cardano.service
sudo wget https://raw.githubusercontent.com/ResponsibleStaking/Cardano-Heartbeat-Failover/main/client/system/failover-cardano.timer
```

Customize the script path in the service
```
sudo nano failover-cardano.service

#ExecStart=/opt/cardano/cnode/custom/heartbeat-failover.sh
#This needs to point to your hearbeat-failover.sh file
```

Customize the timing
```
sudo nano failover-cardano.timer

#Change the row: OnCalendar=*:*:5/10
#Config for bp1:
#OnCalendar=*:*:0/10
#Config for bp2:
#OnCalendar=*:*:5/10

#Resulting to every 5 seconds one of the servers running the job
#10:00:00 bp1
#10:00:05 bp2
#10:00:10 bp1
#10:00:15 bp2
...
```

Enable and Activate the Service
```
sudo systemctl enable failover-cardano.service
sudo systemctl start failover-cardano.service

sudo systemctl enable failover-cardano.timer
sudo systemctl start failover-cardano.timer
```

Validate if the Service is executed. Run the following command and check if the last execution is updating every 10 seconds: inactive (dead) since Fri 2021-08-06 13:30:15 CEST
```
sudo systemctl status failover-cardano.service

#● failover-cardano.service - Heartbeat Signal Service
#   Loaded: loaded (/etc/systemd/system/failover-cardano.service; enabled; vendor preset: enabled)
#   Active: inactive (dead) since Fri 2021-08-06 13:30:15 CEST; 123ms ago
#  Process: 50018 ExecStart=/opt/cardano/cnode/custom/heartbeat-failover.sh (code=exited, status=0/SUCCESS)
# Main PID: 50018 (code=exited, status=0/SUCCESS)

#Aug 06 13:30:15 debian systemd[1]: Starting Heartbeat Signal Service...
#Aug 06 13:30:15 debian heartbeat-failover.sh[50018]: Sending Heartbeat signal for server bp1: 36593029
#Aug 06 13:30:15 debian heartbeat-failover.sh[50018]: Last Status: Active
#Aug 06 13:30:15 debian heartbeat-failover.sh[50018]: New Status: Active
#Aug 06 13:30:15 debian heartbeat-failover.sh[50018]: Status not changed
#Aug 06 13:30:15 debian systemd[1]: failover-cardano.service: Succeeded.
#Aug 06 13:30:15 debian systemd[1]: Started Heartbeat Signal Service.
```
