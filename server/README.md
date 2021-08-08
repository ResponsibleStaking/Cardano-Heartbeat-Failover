# Server-Side Part
The Server-Side consist of the following AWS Services
* A DynamoDB Table to persist the current state
* A Lambda Function to host the logic
* An API Gateway endpoint to expose the function and protect it with an API Key

The AWS free tier allows to process 1 mio Requests (API Gateway Call + Lambda Execution).
With the proposed timing of 10 second per server we consume ~520k calls.

## AWS Account Creation

First you need to create an AWS Account
* Open https://console.aws.amazon.com/
* Follow the instruction to create an Account

Login

Switch to a region which is close to your servers

## DynamoDB

Create a DynamoDB Table with the name "server-failover-data"
* Log into AWS Console https://console.aws.amazon.com/
* Switch to DynamoDB
* Create Table with Name: "server-failover-data", Primary-Key: "tenant-id"


Define an IAM Role to make it accessible for the Lambda Function Laterwards
* Switch to IAM in AWS Console
* Go to Roles and continue
* Click Create Role
* Choose "Lambda" Scenario and continue
* with Name: "failover-service-role"
* Click "Create Richtlinie"
* Search for the Service "DynamoDB"
* Define the allowed actions - Read: "GetItem, Query, Scan" and Write: "PutItem, UpdateItem"
* Define the spezific Resource "ARN of your DynamoDB Table" (look it up in DynamoDB first)
* Continue to Tags and finish the Wizard


## Lambda function

Create a new Lambda Function
* Switch to Lambda in AWS Console
* Click "Create Function"
* Choose without rule and name it: failover-service

Copy & Paste the code
* Copy and paste the code from https://raw.githubusercontent.com/ResponsibleStaking/Cardano-Heartbeat-Failover/main/server/failover-service.js

Customize the Region in the Code
* Modify the 3rd line of the code to reflect your AWS Region

Define the Execution Permissions
* Switch to the configuration Tab of the lambda function and select Permissions
* In Execution Role click on "Use an existing role and select the previously created role

Define the environment variables
* Switch to the Configuration tab of the lambda function and create the following Environment Variables:
```
ACCEPTED_NODE_NAMES=bp1,bp2
MIN_SWITCHOVER_INTERVAL=300
TRESHOLD_NOK_STATUS=300
TRESHOLD_OK_STATUS=300
```

Test the function
* Create a test event with the following payload
* Generate a UUID on https://www.uuidgenerator.net/ and paste it into the tenant-id parameter
* Keep this UUID as you will need it for your Client configuration as well
```
{
  "queryStringParameters": {
    "tenant-id": "11111111-2222-3333-4444-555555555555",
    "nodeName": "bp1",
    "currentTip": 36544290,
    "debug": 1
  }
}
```
* Click Test and see if the function executes properly

## API Gateway

Create a new API Gateway Endpoint
* Switch to API Gateway in AWS Console
* Click on Create API
* Choose REST API,
* Name it: failover-service
* Endpoint Type: Regional

Define the API Resource
* In the created API Click Actions > Create Resource
* Call it "failover-service"
* Activate CORS and Submit

Define the Action
* In the same Actions dropdown select "Create Methos" and then "GET"
* Integration Type: "Lambda Function"
* Us Proxy Integration: "checked"
* Assign the Lambda function "failover-service"

Details on the GET Action
* click on GET (below failover-service in the Resources Tree)
* Click on the "Method Response" Tile Headline
* There open the "200" Response and add a Header "Access-Control-Allow-Origin"

Finally on the Resource Panel
* Click on the "failover-service" Resource
* In the Action menu click "Enable CORS"

Define a Usage Plan
* Go to Usage Plans
* Create a new Usage Plan
* Name: "BasicUsage"
* Define a contingent of 20.000 Requests / Day
* Go to the "API Keys" Tab
* Click create and assign new API Key. Store the API Key as you will need it for calling the service

Publish the API
* In the resource Tree click on the "failover-service"
* In the Actions menu click on "Publish API"
* Create a "Production" Publication Zone and assign it

Test
* Now the Endpoint should be ready to be called
* Find the URL Endpoint in the Stage Production.
* Navigate the Tree down to "GET"
* On top of the page you see the Request URL
* Use some REST Client (e.g. Postman) and Paste the URL
* Add a Header: x-api-key and assign your AWS API Key
* Add the parameters for testing:
```
?tenant-id=11111111-2222-3333-4444-555555555555&nodeName=bp1&currentTip=36543980&debug=1
```
