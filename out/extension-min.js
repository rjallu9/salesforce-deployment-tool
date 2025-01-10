"use strict";var __createBinding=this&&this.__createBinding||(Object.create?function(a,t,e,i){i===void 0&&(i=e);var n=Object.getOwnPropertyDescriptor(t,e);(!n||("get"in n?!t.__esModule:n.writable||n.configurable))&&(n={enumerable:!0,get:function(){return t[e]}}),Object.defineProperty(a,i,n)}:function(a,t,e,i){i===void 0&&(i=e),a[i]=t[e]}),__setModuleDefault=this&&this.__setModuleDefault||(Object.create?function(a,t){Object.defineProperty(a,"default",{enumerable:!0,value:t})}:function(a,t){a.default=t}),__importStar=this&&this.__importStar||function(){var a=function(t){return a=Object.getOwnPropertyNames||function(e){var i=[];for(var n in e)Object.prototype.hasOwnProperty.call(e,n)&&(i[i.length]=n);return i},a(t)};return function(t){if(t&&t.__esModule)return t;var e={};if(t!=null)for(var i=a(t),n=0;n<i.length;n++)i[n]!=="default"&&__createBinding(e,t,i[n]);return __setModuleDefault(e,t),e}}(),__importDefault=this&&this.__importDefault||function(a){return a&&a.__esModule?a:{default:a}};Object.defineProperty(exports,"__esModule",{value:!0}),exports.activate=activate,exports.deactivate=deactivate;const vscode=__importStar(require("vscode")),path=require("path"),axios=require("axios"),xml2js=require("xml2js"),{exec}=require("child_process"),favorites_json_1=__importDefault(require("./assets/favorites.json")),fs=require("fs"),AdmZip=require("adm-zip");let tmpDirectory="";function activate(a){const t=vscode.commands.registerCommand("salesforce-deployment-tool.build",()=>{const e=vscode.window.createWebviewPanel("packageBuilder","Salesforce Deployment Tool",vscode.ViewColumn.One,{enableScripts:!0,retainContextWhenHidden:!0}),i=vscode.Uri.file(path.join(a.extensionPath,"out","assets/index.js")),n=e.webview.asWebviewUri(i),s=vscode.Uri.file(path.join(a.extensionPath,"out","assets/index.css")),o=e.webview.asWebviewUri(s),c=path.join(a.extensionPath,"out","assets/favorites.json");e.webview.html=getWebviewContent(a.extensionPath,n,o);let l=[],p=!1;tmpDirectory=a.extensionPath+"/tmp",e.webview.onDidReceiveMessage(r=>{switch(r.command){case"getAuthOrgs":getAuthOrgs().then(d=>{l=d,e.webview.postMessage({command:"orgsList",orgs:d})});break;case"loadTypes":var f=l.find(d=>d.orgId===r.sourceOrgId);getTypes(f.accessToken,f.instanceUrl,favorites_json_1.default).then(d=>{e.webview.postMessage({command:"types",types:d})});break;case"loadComponents":if(r.type){var f=l.find(h=>h.orgId===r.sourceOrgId);getComponents(f.accessToken,f.instanceUrl,r.type).then(h=>{e.webview.postMessage({command:"components",components:h,type:r.type})})}break;case"updateFavorites":r.data&&fs.writeFile(c,JSON.stringify(r.data,null,2),"utf8",d=>{d&&vscode.window.showErrorMessage("Unable to update favorites..!!")});break;case"deploy":e.webview.postMessage({command:"deployStatus",result:{stage:"retrieve",message:"Retrieve components Initiated"}});var f=l.find(d=>d.orgId===r.sourceOrgId),v=l.find(d=>d.orgId===r.destOrgId);retrieve(f.accessToken,f.instanceUrl,r.packagexml).then(d=>{e.webview.postMessage({command:"deployStatus",result:{stage:"retrieve",message:"Retrieve components Inprogress"}});let h=d,m=setInterval(()=>{retrieveStatus(f.accessToken,f.instanceUrl,h).then(u=>{u.done==="true"&&(e.webview.postMessage({command:"deployStatus",result:{stage:"retrieveCompleted",message:"Retrieve components Completed"}}),clearInterval(m),p?e.webview.postMessage({command:"deployStatus",result:{stage:"deployment",message:r.checkOnly?"Validation Cancelled":"Deployment Cancelled"}}):(e.webview.postMessage({command:"deployStatus",result:{stage:"deployment",message:r.checkOnly?"Validation Initiated":"Deployment Initiated"}}),deploy(v.accessToken,v.instanceUrl,u.zipFile,r.checkOnly,r.testLevel,r.testClasses).then(M=>{let x=M,I=setInterval(()=>{p&&(cancelDeploy(v.accessToken,v.instanceUrl,x),p=!1),deployStatus(v.accessToken,v.instanceUrl,x).then(w=>{w.done==="true"&&clearInterval(I),w.stage="deploymentStatus",e.webview.postMessage({command:"deployStatus",result:w})}).catch(w=>{clearInterval(I)})},2e3)})))}).catch(u=>{clearInterval(m)})},1e3)});break;case"quickDeploy":var v=l.find(d=>d.orgId===r.destOrgId);e.webview.postMessage({command:"deployStatus",result:{stage:"deployment",message:"Deployment Initiated"}}),quickDeploy(v.accessToken,v.instanceUrl,r.id).then(d=>{let h=d,m=setInterval(()=>{deployStatus(v.accessToken,v.instanceUrl,h).then(u=>{u.done==="true"&&clearInterval(m),u.stage="deploymentStatus",e.webview.postMessage({command:"deployStatus",result:u})}).catch(u=>{clearInterval(m)})},2e3)});break;case"cancelDeploy":p=!0;break;case"toastMessage":vscode.window.showInformationMessage(`${r.message}`);break;case"compare":let b=new Map,g=new Map;var f=l.find(d=>d.orgId===r.sourceOrgId),v=l.find(d=>d.orgId===r.destOrgId),y=Date.now();retrieve(f.accessToken,f.instanceUrl,r.packagexml).then(d=>{let h=d,m=setInterval(()=>{retrieveStatus(f.accessToken,f.instanceUrl,h).then(u=>{u.done==="true"&&(clearInterval(m),b=u.fileNames,extractComponents(u.zipFile,tmpDirectory+"/"+y,f.alias),g.size>0&&postCompareResults(b,g,tmpDirectory+"/"+y+"/"+f.alias,tmpDirectory+"/"+y+"/"+v.alias,e))}).catch(u=>{vscode.window.showErrorMessage(`Error: ${JSON.stringify(u)}`),clearInterval(m)})},1e3)}),retrieve(v.accessToken,v.instanceUrl,r.packagexml).then(d=>{let h=d,m=setInterval(()=>{retrieveStatus(v.accessToken,v.instanceUrl,h).then(u=>{u.done==="true"&&(clearInterval(m),g=u.fileNames,extractComponents(u.zipFile,tmpDirectory+"/"+y,v.alias),b.size>0&&postCompareResults(b,g,tmpDirectory+"/"+y+"/"+f.alias,tmpDirectory+"/"+y+"/"+v.alias,e))}).catch(u=>{vscode.window.showErrorMessage(`Error: ${JSON.stringify(u)}`),clearInterval(m)})},1e3)});break;case"filePreview":let S=r.file+": Source \u2194 Target";vscode.commands.executeCommand("vscode.diff",vscode.Uri.file(r.source),vscode.Uri.file(r.dest),S,{preview:!1});break;default:console.log("Unknown command:",r.command)}})});a.subscriptions.push(t)}function postCompareResults(a,t,e,i,n){let s=[];a.forEach((o,c)=>{let l={name:c,source:e+"/"+o,dest:""};t.has(c)&&(l.dest=i+"/"+t.get(c)),s.push(l)}),n.webview.postMessage({command:"compareResults",files:s})}function extractComponents(a,t,e){const i=Buffer.from(a,"base64");fs.existsSync(t)||fs.mkdirSync(t);const n=path.join(t,e+".zip");fs.writeFileSync(n,i),fs.existsSync(t+"/"+e)||fs.mkdirSync(t+"/"+e),new AdmZip(n).extractAllTo(t+"/"+e,!0)}function cancelDeploy(a,t,e){return new Promise((i,n)=>{sendSoapReuest(a,t,"<met:cancelDeploy><met:String>"+e+"</met:String></met:cancelDeploy>").then(s=>{const o=s["soapenv:Envelope"]["soapenv:Body"].cancelDeployResponse.result;i(o)}).catch(s=>{vscode.window.showErrorMessage(`Error: ${JSON.stringify(s)}`),n(s)})})}function quickDeploy(a,t,e){return new Promise((i,n)=>{sendSoapReuest(a,t,"<met:deployRecentValidation><met:validationId>"+e+"</met:validationId></met:deployRecentValidation>").then(s=>{const o=s["soapenv:Envelope"]["soapenv:Body"].deployRecentValidationResponse.result;i(o)}).catch(s=>{n(s)})})}function deployStatus(a,t,e){return new Promise((i,n)=>{sendSoapReuest(a,t,"<met:checkDeployStatus><met:asyncProcessId>"+e+"</met:asyncProcessId><met:includeDetails>true</met:includeDetails></met:checkDeployStatus>").then(s=>{const o=s["soapenv:Envelope"]["soapenv:Body"].checkDeployStatusResponse.result;i(o)}).catch(s=>{n(s)})})}function deploy(a,t,e,i,n,s){return new Promise((o,c)=>{sendSoapReuest(a,t,"<met:deploy><met:ZipFile>"+e+"</met:ZipFile><met:DeployOptions><met:checkOnly>"+i+"</met:checkOnly><met:testLevel>"+n+"</met:testLevel>"+s+"<met:singlePackage>true</met:singlePackage></met:DeployOptions></met:deploy>").then(l=>{const p=l["soapenv:Envelope"]["soapenv:Body"].deployResponse.result.id;o(p)}).catch(l=>{c(l)})})}function retrieveStatus(a,t,e){return new Promise((i,n)=>{sendSoapReuest(a,t,"<met:checkRetrieveStatus><met:asyncProcessId>"+e+"</met:asyncProcessId><met:includeZip>true</met:includeZip></met:checkRetrieveStatus>").then(s=>{const o=s["soapenv:Envelope"]["soapenv:Body"].checkRetrieveStatusResponse.result;let c=new Map;o.done==="true"&&o.fileProperties.forEach(l=>{c.set(l.type+"."+l.fullName,l.fileName)}),i({done:o.done,zipFile:o.zipFile,fileNames:c})}).catch(s=>{n(s)})})}function retrieve(a,t,e){return new Promise((i,n)=>{sendSoapReuest(a,t,"<met:retrieve><met:retrieveRequest><met:apiVersion>62.0</met:apiVersion><met:singlePackage>true</met:singlePackage><met:unpackaged>"+e+"</met:unpackaged></met:retrieveRequest></met:retrieve>").then(s=>{const o=s["soapenv:Envelope"]["soapenv:Body"].retrieveResponse.result.id;i(o)}).catch(s=>{n(s)})})}function getComponents(a,t,e){return new Promise((i,n)=>{sendSoapReuest(a,t,"<met:listMetadata><met:queries><met:type>"+e+"</met:type></met:queries></met:listMetadata>").then(s=>{const o=s["soapenv:Envelope"]["soapenv:Body"].listMetadataResponse;if(o!=="")if(o.result instanceof Array){const c=o.result.map(l=>({name:l.fullName,type:l.type,lastModifiedByName:l.lastModifiedByName,lastModifiedDate:new Date(l.lastModifiedDate).toLocaleDateString(),manageableState:l.manageableState}));i(c)}else i([{name:o.result.fullName,type:o.result.type,lastModifiedByName:o.result.lastModifiedByName,lastModifiedDate:new Date(o.lastModifiedDate).toLocaleDateString(),manageableState:o.manageableState}]);else i([])}).catch(s=>{n(s)})})}function getTypes(a,t,e){return new Promise((i,n)=>{sendSoapReuest(a,t,"<met:describeMetadata><met:asOfVersion>62.0</met:asOfVersion></met:describeMetadata>").then(s=>{const o=s["soapenv:Envelope"]["soapenv:Body"].describeMetadataResponse.result.metadataObjects,c=[];o.forEach(l=>{c.push({name:l.xmlName,isFavorite:e.indexOf(l.xmlName)>=0,hidden:!1}),l.childXmlNames&&(l.childXmlNames instanceof Array?l.childXmlNames.forEach(p=>{c.push({name:p,isFavorite:e.indexOf(l.xmlName)>=0,hidden:!1})}):c.push({name:l.childXmlNames,isFavorite:e.indexOf(l.xmlName)>=0,hidden:!1}))}),i(c)}).catch(s=>{n(s)})})}function sendSoapReuest(a,t,e){const i=new xml2js.Parser({explicitArray:!1,ignoreAttrs:!0});let n='<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:met="http://soap.sforce.com/2006/04/metadata"><soapenv:Header><met:SessionHeader><met:sessionId>'+a+"</met:sessionId></met:SessionHeader></soapenv:Header><soapenv:Body>"+e+"</soapenv:Body></soapenv:Envelope>";return new Promise((s,o)=>{axios.post(t+"/services/Soap/m/62.0",n,{headers:{"Content-Type":"text/xml; charset=utf-8",SOAPAction:"Update"}}).then(c=>{i.parseString(c.data,(l,p)=>{if(l){vscode.window.showErrorMessage("Error parsing SOAP XML:",l);return}s(p)})}).catch(c=>{i.parseString(c.response.data,(l,p)=>{vscode.window.showWarningMessage("Unable to connect to the Org. Message: "+p["soapenv:Envelope"]["soapenv:Body"]["soapenv:Fault"].faultstring),o(p["soapenv:Envelope"]["soapenv:Body"]["soapenv:Fault"].faultstring)})})})}function getAuthOrgs(){return new Promise((a,t)=>{exec("sf org list --json",(e,i,n)=>{if(e)t(`Error: ${e}`);else try{const s=JSON.parse(i).result,o=[],c=[],l=[];c.push(...s.other,...s.sandboxes,...s.nonScratchOrgs,...s.devHubs,...s.scratchOrgs),c.forEach(p=>{p.connectedStatus==="Connected"&&l.indexOf(p.orgId)<0&&(o.push({name:p.alias+"("+p.username+")",alias:p.alias,orgId:p.orgId,accessToken:p.accessToken,instanceUrl:p.instanceUrl}),l.push(p.orgId))}),a(o)}catch(s){t(`Parse Error: ${s.message}`)}})})}function getWebviewContent(a,t,e){return`<!doctype html>
			<html lang="en">
			<head>
				<meta charset="UTF-8" />
				<meta name="viewport" content="width=device-width, initial-scale=1.0" />
				<title>Salesforce Deployment Tool</title>
				<script src="https://code.jquery.com/jquery-3.7.1.min.js"><\/script>
				<script src="https://code.jquery.com/ui/1.14.1/jquery-ui.min.js"><\/script>
				<script src="https://cdn.datatables.net/2.1.8/js/dataTables.min.js"><\/script>				
				<link rel="stylesheet" href="https://cdn.datatables.net/2.1.8/css/dataTables.dataTables.min.css">
				<script src="https://cdn.datatables.net/select/2.1.0/js/dataTables.select.min.js"><\/script>				
				<link rel="stylesheet" href="https://cdn.datatables.net/select/2.1.0/css/select.dataTables.min.css">
				<link rel="stylesheet" href="https://code.jquery.com/ui/1.14.1/themes/base/jquery-ui.css">
			</head>
			<body>	
				<div style="margin: 20px;">
					<h1>Salesforce Deployment Tool</h1>
					
					<div id="source-org" style="float:left;margin-right:5px;display:none;">	
						<label for="text" for="source-org-field" class="top-label">Source Org: </label>
						<select type="text" class="source-org-field" id="source-org-field" style="height:36px;width:350px;">
						</select>		
					</div>
					<div id="selection" style="display:none">
						<div class="form-panel">
							<div>
								<div style="float:left;" >
									<div>	
										<label for="text" for="dd-text-field" class="top-label">Type: </label>
										<input type="text" class="dd-text-field" id="dd-text-field"></input>								
										<span style="margin-left:-20px;pointer-events: none;color: #888;">\u25BC</span>
									</div>
									<div class="dd-option-box">
										<div style="padding:5px 10px 5px 10px;">
											<input type="checkbox" value="All" class="dd-select-all">
											<label for="select-all">All</label>
										</div>
										<div class="dd-options">
											<ui style="list-style-type: none;">                       
											</ui>
										</div>
									</div>
								</div>
								<div style="float:left;padding-left:10px;">	
									<label for="text" for="date-field" class="top-label">Modified-Since: </label>
									<input type="text" class="date-field" id="date-field" style="height:30px;" readonly></input>		
								</div>
								<div style="float:left;padding-left:5px;">	
									<label for="text" for="state-field" class="top-label">State: </label>
									<select type="text" class="state-field" id="state-field" style="height:36px;">
										<option value="unmanaged">Unmanaged</option>
										<option value="installed">Installed</option>
									</select>		
								</div>
							</div>
							<div style="margin-top:22px;">
								<div style="float:left;" >
									<p style="color:#f14c4c;" id="errors"></p>
								</div>
								<button type="button" style="padding: 7px; width: 75px;float:right;" id="next" disabled>Next</button>
								<button type="button" style="padding: 7px; width:100px;float:right;margin-right:5px" id="packagexml" disabled>Package.xml</button>
							</div>
						</div>	
						<div style="margin-top:10px;">
							<div style="float:left;" >
								<p style="color:#f14c4c;" id="errors"></p>
							</div>								
						</div>					
						<div id="tabs" style="margin-top:10px;">
							<ul>
								<li class="tab" name="datatable"><a href="#available" class="available">Available (0)</a></li>
								<li class="tab" name="selecteddatatable"><a href="#selected" class="selected">Selected (0)</a></li>
							</ul>
							<div id="available">
								<table id="datatable" class="display" style="width:100%">
									<thead>
										<tr>
											<th><input type="checkbox" id="all-row-chk" class='all-row-chk'/></th>	
											<th>Name</th>
											<th>Type</th>
											<th>Last Modified By</th>
											<th>Last Modified Date</th>
										</tr>
									</thead>
								</table>
							</div>
							<div id="selected">
								<table id="selecteddatatable" class="display" style="width:100%">
									<thead>
										<tr>	
											<th>Type</th>
											<th>Name</th>
											<th>Last Modified By</th>
											<th>Last Modified Date</th>
										</tr>
									</thead>
								</table>
							</div>
						</div>							
					</div>
					<div id="preview" style="display:none">
						<div style="display:flex;">
							<div style="flex:1">	
								<label for="text" for="dest-org-field" class="top-label">Destination Org: </label>
								<select type="text" class="dest-org-field" id="dest-org-field" style="height:36px;width:300px;">
								</select>		
							</div>
							<div id="deploy-buttons">	
								<button type="button" style="padding: 7px; width: 75px;float:right;margin-top:22px;margin-left: 5px;" id="compare">Compare</button>											
								<button type="button" style="padding: 7px; width: 75px;float:right;margin-top:22px;margin-left: 5px;" id="deploy">Deploy</button>
								<button type="button" style="padding: 7px; width: 75px;float:right;margin-top:22px;margin-left: 5px;" id="validate">Validate</button>	
								<div style="float:right;margin-top:2px;">
									<label for="text" for="testoption-field" class="top-label">Test Options:&nbsp;&nbsp;
										<a href="#" id="view-classes" style="display:none">Classes</a>
									</label>							
									<select type="text" class="testoption-field" id="testoption-field" style="height:33px;width:150px;">
										<option value="NoTestRun">Default</option>
										<option value="RunLocalTests">Run local tests</option>
										<option value="RunAllTestsInOrg">Run all tests</option>
										<option value="RunSpecifiedTests">Run specified tests</option>
									</select>	
								</div>
							</div>							
							<div style="margin-left: 5px;">
								<button type="button" style="padding: 7px; width: 75px;margin-top:22px;" id="previous">Back</button>							
							</div>	
						</div>
						<div id="deploystatus">
							<p><span id="deploylabel">Deployment Status:</span> &nbsp;&nbsp; 
								<a href="#" id="quick-deploy" style="display:none">Quick Deploy</a>
								<a href="#" id="cancel-deploy" style="display:none">Cancel Deployment</a>
							</p>
							<ul class="path-list">
							</ul>							
							<div id="progressbar" class="progressbar"></div>
							<div class="coverage-error" style="display:none;"><p class="coverage-error-label"></p></div>
							<div id="test-classes-dialog" title="Test Classes">
								<p>Provide the names of the test classes in a comma-seprated list.</p>
								<textarea id="test-classes" name="test-classes" rows="15" cols="35">
								</textarea>
								<button type="button" style="padding:2px; width:50px;float:right;" id="save-classes">Save</button>
							</div>
						</div>
						<div id="previewtabs" style="margin-top:10px;">
							<ul>
								<li class="tab" name="previewtable"><a href="#preview" class='preview'>Selected</a></li>
								<li class="tab" name="errortable"><a href="#deployerrors" class='deployerrors'>Deployment Errors</a></li>
								<li class="tab" name="testerrortable"><a href="#testfailures" class='testfailures'>Test Class Failures</a></li>
							</ul>
							<div id="preview">
								<table id="previewtable" class="display" style="width:100%">
									<thead>
										<tr>	
											<th>Type</th>
											<th>Name</th>
											<th>Last Modified By</th>
											<th>Last Modified Date</th>
											<th>Compare</th>
										</tr>
									</thead>
								</table>
							</div>
							<div id="deployerrors">
								<table id="errortable">
									<thead>
										<tr>	
											<th>API Name</th>
											<th>Type</th>
											<th>Line</th>
											<th>Column</th>
											<th>Error Message</th>
										</tr>
									</thead>
								</table>
							</div>
							<div id="testfailures">
								<table id="testerrortable">
									<thead>
										<tr>	
											<th>Class Name</th>
											<th>Method Name</th>
											<th>Error Message</th>
										</tr>
									</thead>
								</table>
							</div>
						</div>							
					</div>
				</div>
				<div id="overlay">
					<div class="cv-spinner">
						<span class="spinner"></span>
						<p style="margin-left: 5px;" class="spinnerlabel">Initializing</p>
					</div>
				</div>
			</body>
			<script src=${t}><\/script>
			<link rel="stylesheet" href=${e}>
			</html>`}function deactivate(){if(tmpDirectory&&fs.existsSync(tmpDirectory))try{fs.rmSync(tmpDirectory,{recursive:!0,force:!0})}catch{}}
