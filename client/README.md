# Client-Side Part
The Client Part consists of 2 pieces
1. A set of Script which takes care and reporting heartbeat signals, fetch the proposed server role and apply it if it changed.
2. A Service which is timed to call the below script every N seconds


## Install the Scripts
First we need to install the scripts which take care about reporting the signal and

Create a folder where the new scripts should be placed
```
mkdir /opt/cardano/cnode/custom
cd /opt/cardano/cnode/custom
```

Download the draft scripts into this folder
```
wget https://raw.githubusercontent.com/ResponsibleStaking/Cardano-Heartbeat-Failover/main/client/scripts/heartbeat-failover.sh
wget https://raw.githubusercontent.com/ResponsibleStaking/Cardano-Heartbeat-Failover/main/client/scripts/heartbeat-failover-makeActive.sh
wget https://raw.githubusercontent.com/ResponsibleStaking/Cardano-Heartbeat-Failover/main/client/scripts/heartbeat-failover-makeStandby.sh
```
Make sure the scripts are executeable through for the owner only
```
chmod 700 heartbeat-failover.sh
chmod 700 heartbeat-failover-makeActive.sh
chmod 700 heartbeat-failover-makeStandby.sh
```

Make sure the scripts are owned by root and are not editable for anyone else.
Note: This is required because the scripts will be used to change firewall rules which requires root access. To avoid manipulation of the script (which is automatically triggered by a service) laterwards nobody else should be allowed to manipulate the script
```
chown root heartbeat-failover.sh
chown root heartbeat-failover-makeActive.sh
chown root heartbeat-failover-makeStandby.sh
```

## Configure the Scripts
Open the main script
```
nano heartbeat-failover.sh
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
nano heartbeat-failover-makeActive.sh
nano heartbeat-failover-makeStandby.sh
```

Test the Standby Script
```
sudo ./heartbeat-failover-makeStandby.sh
```

Test the Activation Script
```
sudo ./heartbeat-failover-makeActive.sh
```

Test the failover scripts
```
sudo ./heartbeat-failover.sh
```

## Install the Service
