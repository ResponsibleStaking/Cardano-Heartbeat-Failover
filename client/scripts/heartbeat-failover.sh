#!/usr/bin/env bash
# shellcheck disable=SC2034,SC2086,SC2230,SC2009,SC2206,SC2062,SC2059

CARDANO_CLI_PATH=/home/USER/.cabal/bin/cardano-cli        #Set the name which was used for Installing CNODE. - e.g. /home/YOUR-USERNAME/.cabal/bin/cardano-cli
                                                          #Make sure to replace YOUR-USER
FAILOVER_SCRIPT_ROOT=/opt/cardano/cnode/custom            #The folder where this script is placed

FAILOVER_SERVICE_HEARTBEAT_URL=                           #AWS Endpoint URL of the service. e.g. https://abcdefghij.execute-api.eu-west-1.amazonaws.com/production/failover-service
FAILOVER_SERVICE_TENANT_ID=                               #Generate a UUID for your environment here: https://www.uuidgenerator.net/
FAILOVER_SERVICE_AUTH_TOKEN=                              #AWS Auth Token
FAILOVER_SERVICE_NODE_NAME=                               #This Name needs to be reflected in the Environment Variables of the AWS Lambda function

TIME_ZONE=Europe/Vienna                                   #Timezone used for logging (used for Linux date command)

######################################
# Do NOT modify code below           #
######################################

export CARDANO_NODE_SOCKET_PATH=/opt/cardano/cnode/sockets/node0.socket

#Get current Slot
customCurrentSlotNoString=$($CARDANO_CLI_PATH query tip --mainnet | grep -Po '\"slot\": \K[0-9]+')
customCurrentSlotNo=$(expr $customCurrentSlotNoString + 0)
now=$(TZ=$TIME_ZONE date +"%Y-%m-%d %T")

if [ $customCurrentSlotNo -gt 0 ]; then

  echo "Sending Heartbeat signal for server $FAILOVER_SERVICE_NODE_NAME: $customCurrentSlotNo"
  response=$(curl -s -m 10 -H "x-api-key: $FAILOVER_SERVICE_AUTH_TOKEN" "$FAILOVER_SERVICE_HEARTBEAT_URL?tenant-id=$FAILOVER_SERVICE_TENANT_ID&nodeName=$FAILOVER_SERVICE_NODE_NAME&currentTip=$customCurrentSlotNo")

  #Read current status
  lastStatus=$(cat $FAILOVER_SCRIPT_ROOT/heartbeat-failover.active)
  echo "Last Status: $lastStatus"

  #Compare new status
  newStatus=$response

  echo "New Status: $newStatus"

  #If changed log the event and update firewall
  if [ "$lastStatus" != "$newStatus" ]; then
    echo "Status changed"
    if [ "$newStatus" == "Active" ]; then
      echo "Switch to Active"
      "$FAILOVER_SCRIPT_ROOT/heartbeat-failover-makeActive.sh"
      echo "$now: Switched from $lastStatus to $newStatus" >> "$FAILOVER_SCRIPT_ROOT/heartbeat-failover.log"
      echo "$newStatus" > "$FAILOVER_SCRIPT_ROOT/heartbeat-failover.active"
    elif [ "$newStatus" == "Standby" ]; then
      echo "Switch to StandBy"
      "$FAILOVER_SCRIPT_ROOT/heartbeat-failover-makeStandby.sh"
      echo "$now: Switched from $lastStatus to $newStatus" >> "$FAILOVER_SCRIPT_ROOT/heartbeat-failover.log"
      echo "$newStatus" > "$FAILOVER_SCRIPT_ROOT/heartbeat-failover.active"
    else
      echo "Invalid new Status -> Not changing anything, next valid signal may trigger a status change if the new status differ from the last valid response"
      echo "$now: Invalid Status Response" >> "$FAILOVER_SCRIPT_ROOT/heartbeat-failover.log"
    fi
  else
    echo "Status not changed"
  fi
else
  echo "Current Tip is invalid, not sending to avoid unwanted switchovers: $customCurrentSlotNo"
  echo "$now: Invalid Tip, not sending: $customCurrentSlotNo" >> "$FAILOVER_SCRIPT_ROOT/heartbeat-failover.log"
fi
