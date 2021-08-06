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

Define an IAM Role to make it accessible for the Lambda Function Laterwards 

## Lambda function

Create a new Lambda Function

Copy & Paste the code

Customize the Region in the Code

Define the environment variables

Test the function

## API Gateway

Create a new API Gateway Endpoint

Define a Usage Plan

Generate an API Key

Test with Browser or Postman
