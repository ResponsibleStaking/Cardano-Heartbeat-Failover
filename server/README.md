# Server-Side Part
The Server-Side consist of the following AWS Services
* A DynamoDB Table to persist the current state
* A Lambda Function to host the logic
* An API Gateway endpoint to expose the function and protect it with an API Key

The AWS free tier allows to process 1 mio. Requests (API Gateway Call + Lambda Execution).
With the proposed timing of 10 second per server we consume ~520k calls.

## AWS Account Creation

First you need to create an AWS Account
* Open https://console.aws.amazon.com/
* Follow the instructions to create an Account
* Login


## DynamoDB

Create a DynamoDB Table with the name "server-failover-data"
* Log into AWS Console https://console.aws.amazon.com/
* Switch to DynamoDB
* Switch to a region which is close to your servers (Upper Right Drop down next to support)
* Create Table with Name: "server-failover-data", Primary-Key: "tenant-id"
* Note down the ARN of the new table. You can find it in the Overview Tab at the boottom


Define an IAM Role to make it accessible for the Lambda Function Laterwards
* Switch to IAM in AWS Console
* Go to Access management > Roles
* Click Create Role
* Choose "Lambda" Scenario and click "Next: Permissions"
* Click "Create policy"
* Click "Choose a service" Search for the Service "DynamoDB"
* Define the allowed actions - Read: "GetItem, Query, Scan" and Write: "PutItem, UpdateItem"
* Define the specific Resource. Click "Add ARN" in the table area. Paste the ARN of your DynamoDB Table into the "Specify ARN for table" field
* Continue to Tags, Review
* Define the Policy Name: "failover-service-policy"
* Back to the Role creation window search for the new policy "failover-service-policy"
* continue to Tags > Review
* Name it "failover-service-policy" and click "Create Role"


## Lambda function

Create a new Lambda Function
* Switch to Lambda in AWS Console
* Click "Create Function"
* Choose "Author from scratch" and name it: failover-service
* Click "Create Function"

Copy & Paste the code
* Copy and paste the code from https://raw.githubusercontent.com/ResponsibleStaking/Cardano-Heartbeat-Failover/main/server/failover-service.js
* Click "Deploy" to push the Code live

Customize the Region in the Code
* Modify the 3rd line of the code to reflect your AWS Region

Define the Execution Permissions
* Switch to the configuration Tab of the lambda function and select Permissions
* In Execution Role click on "Edit"
* Choose "Use an existing role and select the previously created role

Define the environment variables
* Switch to the Configuration tab of the lambda function and create the following Environment
* Notes: All numbers are in Seconds.
* Considerations: Be aware that a healthy TIP can go up to 120. Even 300 happens during Epoch switches sometimes. In this scenario both servers will have a high TIP age. Anyways a switchover only happens if the Master is not OK and the Standby is OK. If both have aged TIP no switchover will happen.

* Consid2: The TIP age is also used to measure inactivity when a server is not sending heartbeats at all. If the server is not able to connect the last reported tip will get old and as soon as the threshold is reached it will be considered NOK.
Variables:
```
ACCEPTED_NODE_NAMES=bp1,bp2
MIN_SWITCHOVER_INTERVAL=300
TRESHOLD_NOK_STATUS=300
TRESHOLD_OK_STATUS=300
```

Test the function
* Create a test event with the following payload
* Call it "TestBp1NewTipDebug"
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
* Click Save changes
* Click Test and see if the function executes properly
* Jump over to DynamoDB > Tables > Select your Table > Items and see if a new item was created

## API Gateway

Create a new API Gateway Endpoint
* Switch to API Gateway in AWS Console
* Click on Create API
* Choose REST API and click Build
* Name it: failover-service
* Endpoint Type: Regional

Define the API Resource
* In the created API Click Actions > Create Resource
* Call it "failover-service"
* Enable API Gateway CORS and click "Create Resource"

Define the Action
* In the same Actions dropdown select "Create Methods" and then choose get "GET" and click the small OK button next to it
* Integration Type: "Lambda Function"
* Use Proxy Integration: "checked"
* Assign the Lambda function "failover-service"
* Submit and confirm that API Gateway gets access to the Lambda function

Details on the GET Action
* Click on the "Method Request"
* Set "API Key Required" to "true" and click the Confirm Icon
* Click on the "Method Response" Tile Headline
* There open the "200" Response and add a Header "Access-Control-Allow-Origin", Click the small OK icon next to it

Finally Deploy the API
* In the Action menu click "Enable CORS"
* Submit with default values
* Then again in the Action menu click "Deploy API"
* Select "New Stage"
* Call it "production"
* Click Deploy
* Then click "Save Changes"
* In the Tree navigate to production > / > /failover-service > GET
* Note down the Invoke URL on the top of the page


Define a Usage Plan
* Go to Usage Plans
* Create a new Usage Plan
* Name: "BasicUsage"
* Disable throttling
* Define a quota of 20.000 Requests / Day
* Click Next
* Click Add API Stage and select the API "failover-service" and Stage "production"
* Click the small OK Icon to confirm
* Click next
* Click "Create API Key and add to Usage Plan". Store the API Key as you will need it for calling the service
* Go to "API Keys" in the left menu. Select the Key you just created > Show the API KEY and Copy it for later use

Test
* Now the Endpoint should be ready to be called
* Use some REST Client (e.g. Postman) and Paste the URL which you copied earlier (Invoke URL in the Deploy Step)
* Add a Header: x-api-key and assign your AWS API Key (Which you collected in the )
* Add the parameters for testing:
```
?tenant-id=11111111-2222-3333-4444-555555555555&nodeName=bp1&currentTip=36543980&debug=1&json=1
```

Debugging
* If you test the function in Lambda directly the Console log will be visible directly
* If you call it through the Invoke URL (e.g. through Postman) all logs will be made available in CloudWatch > Log Insights 
* The URL parameter "debug" will generate detailed logging entries
* Minimal logging (1 row per request with all important infos) is logged (also without debug parameter)
