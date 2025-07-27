# Salesforce Deployment Suite for Visual Studio Code

This extension is designed to streamline the deployment process between Salesforce orgs (Scratch Orgs, Sandboxes, and Developer Edition (DE) Orgs). 
Developers and Admins can easily search, select, and deploy metadata components.

### <ins>Key Features</ins>

#### Metadata Management:

* Search & Select metadata components directly from authorized orgs.
* Advanced Filters — Filter components by Type, Name, Last Modified Date, and Last Modified By.
* Compare Components — Compare metadata between Source and Target orgs to identify differences before deployment.
* Caching Support — Cache component lists to reduce load times and avoid fetching data from the org on every request.
* Download & Delete metadata from Source org.
#### Component Handling:

* CSV Export — Export available or selected components to a CSV file.
* Bulk Selection — Quickly select components using the TYPE.NAME format.
#### Deployment Options:

* Package.xml Generation — Generate package.xml for use in tools like the ANT Migration Tool.
* Deploy/Validate — Deploy or validate components to/from different authorized orgs.
* Test Options — Choose from various test levels during deployment/validation.
#### Additional Features:

* View Test Class Failures — Display detailed test class failures, including error messages and stack traces.
* Track Deployment Failures — Get a clear view of failed deployments with reasons and failed components highlighted.
* Cancel Deployment — Ability to cancel ongoing deployments.
* Quick Deployment — Fast-track deployments that have been validated successfully.

 

### <ins>Workflow Guide</ins>

* **Setup SFDX Project in VS Code:** Install Salesforce CLI and VS Code, add the Salesforce Extension Pack, create a project using SFDX: Create Project With Manifest, and authorize at least two orgs using SFDX: Authorize an Org.
* Launch the Extension using SFDX Deployment: Select and Deploy metadata
  
  
