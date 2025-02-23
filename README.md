# Salesforce Deployment Tool for Visual Studio Code

This extension is designed to streamline the deployment process between Salesforce orgs (Scratch Orgs, Sandboxes, and Developer Edition (DE) Orgs). 
Developers and Admins can easily search, select, and deploy metadata components.

### <ins>Key Features</ins>

#### Metadata Management:

* Search & Select metadata components directly from authorized orgs.
* Advanced Filters — Filter components by Type, Name, Last Modified Date, and Last Modified By.
* Compare Components — Compare metadata between Source and Target orgs to identify differences before deployment.
* Caching Support — Cache component lists to reduce load times and avoid fetching data from the org on every request.
#### Component Handling:

* Snapshots — Save selected components as snapshots for future deployments.
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
  ![image](https://github.com/user-attachments/assets/38090a74-8068-4c34-90b8-3695e7a60b3b)
* **Select Source Org:** Choose the source org from available authorized orgs.
  ![image](https://github.com/user-attachments/assets/e04e08f8-4d89-4ba2-91c5-8dc64235a661)
* **Load Components:** On org selection, the tool loads all available components. Components are loaded from cache if previously fetched to optimize performance.
  ![image](https://github.com/user-attachments/assets/b077f613-8c31-46fa-a3bf-3c2e6e380ada)
* **Filter Components:** Use the 'Type' dropdown to filter components by type (e.g., ApexClass, CustomField, LightningComponentBundle, etc.).
  ![image](https://github.com/user-attachments/assets/afee032f-d101-4cc7-a764-d2a7e9e141f3)
* **Select Components:** Search and select components to be deployed.
  ![image](https://github.com/user-attachments/assets/dfb8fa43-7e4e-4e24-9111-eb711ac5e1a2)
* **Bulk Selection:** Use the Bulk Selection button to select multiple components at once using the TYPE.NAME format.
  ![image](https://github.com/user-attachments/assets/dcd9763b-131a-4ce0-8aaa-87a38b343ce8)
* **Manage Selections:** Switch to the 'Selected' tab to review selected components.Uncheck any component to remove it from the selection.
  ![image](https://github.com/user-attachments/assets/2e8094f6-244b-4f40-8bca-d8026a33e852)
* **Generate Package.xml:** Click the 'Package.xml' button to generate the package.xml for deployment.
  ![image](https://github.com/user-attachments/assets/f5660396-23eb-497e-a5cc-6141ad3d96c2)
* **Export Components:** Use Export All or Export Selection buttons to save the list of components as a CSV file.
  ![image](https://github.com/user-attachments/assets/7c586b72-a3a2-46c9-a4e8-172c7852df0e)
* **Snapshots:** Save component selections as Snapshots for future deployments.
  ![image](https://github.com/user-attachments/assets/b485a9b2-6a2c-47cb-a1d6-f2650c6334a2)
* **Select Destination Org:** Click 'Next' to move to the next screen and select the destination org for deployment.
  ![image](https://github.com/user-attachments/assets/90c89c92-1ac3-49b0-8606-992d10607862)
* **Test Options:** Use the 'Test Options' dropdown to select test levels (e.g., Run Local Tests, Run All Tests).
  ![image](https://github.com/user-attachments/assets/03f421ce-c7e9-49ff-b909-d9cff4b58ef2)
* **Compare Components:** Click the Compare button to view differences between source and target org components.
  ![image](https://github.com/user-attachments/assets/b9eb52f4-26ec-4b89-b25c-d66dcc6bd8ff)
* **Validate & Quick Deploy:** Use the Validate button to validate components against the target org. If validation passes, use Quick Deployment for immediate deployment.
  ![image](https://github.com/user-attachments/assets/5a25d455-a79e-42ae-8948-642ebf0bb2ce)
  ![image](https://github.com/user-attachments/assets/d35e758a-c666-46e9-a3df-5a8b74b0dcc2)
* **Deploy & Cancel:** Click the Deploy button to start the deployment. Use the Cancel link to abort an ongoing deployment.
  ![image](https://github.com/user-attachments/assets/67344317-e4f7-4766-85d1-e2442996c9f1)
  ![image](https://github.com/user-attachments/assets/e536a978-f7ea-48db-98f6-cf869093c1e7)
* **Review Failures & Coverage:** Use dedicated tabs to review Test Class Failures, Component Deployment Failures and Code Coverages.
  ![image](https://github.com/user-attachments/assets/d692c00b-fe12-49f1-a3ae-c3ea3313308d)