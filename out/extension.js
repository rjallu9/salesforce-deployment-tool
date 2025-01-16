"use strict";var __createBinding=this&&this.__createBinding||(Object.create?function(a,s,e,l){l===void 0&&(l=e);var i=Object.getOwnPropertyDescriptor(s,e);(!i||("get"in i?!s.__esModule:i.writable||i.configurable))&&(i={enumerable:!0,get:function(){return s[e]}}),Object.defineProperty(a,l,i)}:function(a,s,e,l){l===void 0&&(l=e),a[l]=s[e]}),__setModuleDefault=this&&this.__setModuleDefault||(Object.create?function(a,s){Object.defineProperty(a,"default",{enumerable:!0,value:s})}:function(a,s){a.default=s}),__importStar=this&&this.__importStar||function(){var a=function(s){return a=Object.getOwnPropertyNames||function(e){var l=[];for(var i in e)Object.prototype.hasOwnProperty.call(e,i)&&(l[l.length]=i);return l},a(s)};return function(s){if(s&&s.__esModule)return s;var e={};if(s!=null)for(var l=a(s),i=0;i<l.length;i++)l[i]!=="default"&&__createBinding(e,s,l[i]);return __setModuleDefault(e,s),e}}();Object.defineProperty(exports,"__esModule",{value:!0}),exports.activate=activate,exports.deactivate=deactivate;const vscode=__importStar(require("vscode")),path=require("path"),axios=require("axios"),xml2js=require("xml2js"),{exec}=require("child_process"),fs=require("fs"),AdmZip=require("adm-zip");let tmpDirectory="";function activate(a){const s=vscode.commands.registerCommand("salesforce-deployment-tool.build",()=>{const e=vscode.window.createWebviewPanel("packageBuilder","Salesforce Deployment Tool",vscode.ViewColumn.One,{enableScripts:!0,retainContextWhenHidden:!0}),l=vscode.Uri.file(path.join(a.extensionPath,"out","assets/index.js")),i=e.webview.asWebviewUri(l),n=vscode.Uri.file(path.join(a.extensionPath,"out","assets/index.css")),d=e.webview.asWebviewUri(n);e.webview.html=getWebviewContent(a.extensionPath,i,d);let o=[],c=!1;tmpDirectory=a.globalStorageUri.fsPath+"/tmp",e.webview.onDidReceiveMessage(t=>{switch(t.command){case"getAuthOrgs":getAuthOrgs().then(p=>{o=p,e.webview.postMessage({command:"orgsList",orgs:p})});break;case"loadTypes":var r=o.find(p=>p.orgId===t.sourceOrgId);let y=[];const b=path.join(a.globalStorageUri.fsPath,"selections.json");fs.existsSync(b)&&(y=JSON.parse(fs.readFileSync(b,"utf-8"))),getTypes(r.accessToken,r.instanceUrl,a.globalStorageUri.fsPath).then(p=>{e.webview.postMessage({command:"types",types:p,selections:y})});break;case"loadComponents":if(t.type){var r=o.find(f=>f.orgId===t.sourceOrgId);getComponents(r.accessToken,r.instanceUrl,t.type,t.isFolder).then(f=>{e.webview.postMessage({command:"components",components:f,type:t.type})}).catch(f=>{e.webview.postMessage({command:"components",components:[],type:t.type})})}break;case"updateFavorites":if(t.data){const p=path.dirname(a.globalStorageUri.fsPath+"/favorites.json");fs.existsSync(p)||fs.mkdirSync(p,{recursive:!0}),fs.writeFileSync(a.globalStorageUri.fsPath+"/favorites.json",JSON.stringify(t.data,null,2),"utf8",f=>{f&&vscode.window.showErrorMessage("Unable to update favorites..!!")})}break;case"updateSelections":if(t.data){const p=path.dirname(a.globalStorageUri.fsPath+"/selections.json");fs.existsSync(p)||fs.mkdirSync(p,{recursive:!0}),fs.writeFile(a.globalStorageUri.fsPath+"/selections.json",JSON.stringify(t.data,null,2),"utf8",f=>{f&&vscode.window.showErrorMessage("Unable to update selections..!!")})}break;case"deploy":e.webview.postMessage({command:"deployStatus",result:{stage:"retrieve",message:"Retrieve components Initiated"}});var r=o.find(p=>p.orgId===t.sourceOrgId),h=o.find(p=>p.orgId===t.destOrgId);retrieve(r.accessToken,r.instanceUrl,t.packagexml).then(p=>{e.webview.postMessage({command:"deployStatus",result:{stage:"retrieve",message:"Retrieve components Inprogress"}});let f=p,m=setInterval(()=>{retrieveStatus(r.accessToken,r.instanceUrl,f).then(u=>{u.done==="true"&&(e.webview.postMessage({command:"deployStatus",result:{stage:"retrieveCompleted",message:"Retrieve components Completed"}}),clearInterval(m),c?e.webview.postMessage({command:"deployStatus",result:{stage:"deployment",message:t.checkOnly?"Validation Cancelled":"Deployment Cancelled"}}):(e.webview.postMessage({command:"deployStatus",result:{stage:"deployment",message:t.checkOnly?"Validation Initiated":"Deployment Initiated"}}),deploy(h.accessToken,h.instanceUrl,u.zipFile,t.checkOnly,t.testLevel,t.testClasses).then(E=>{let I=E,M=setInterval(()=>{c&&(cancelDeploy(h.accessToken,h.instanceUrl,I),c=!1),deployStatus(h.accessToken,h.instanceUrl,I).then(w=>{w.done==="true"&&clearInterval(M),w.stage="deploymentStatus",e.webview.postMessage({command:"deployStatus",result:w})}).catch(w=>{clearInterval(M)})},2e3)})))}).catch(u=>{clearInterval(m)})},1e3)});break;case"quickDeploy":var h=o.find(p=>p.orgId===t.destOrgId);e.webview.postMessage({command:"deployStatus",result:{stage:"deployment",message:"Deployment Initiated"}}),quickDeploy(h.accessToken,h.instanceUrl,t.id).then(p=>{let f=p,m=setInterval(()=>{deployStatus(h.accessToken,h.instanceUrl,f).then(u=>{u.done==="true"&&clearInterval(m),u.stage="deploymentStatus",e.webview.postMessage({command:"deployStatus",result:u})}).catch(u=>{clearInterval(m)})},2e3)});break;case"cancelDeploy":c=!0;break;case"toastMessage":vscode.window.showInformationMessage(`${t.message}`);break;case"compare":let g=new Map,x=new Map;var r=o.find(p=>p.orgId===t.sourceOrgId),h=o.find(p=>p.orgId===t.destOrgId),v=Date.now();let S=!1,k=!1;retrieve(r.accessToken,r.instanceUrl,t.packagexml).then(p=>{let f=p,m=setInterval(()=>{retrieveStatus(r.accessToken,r.instanceUrl,f).then(u=>{u.done==="true"&&(clearInterval(m),g=u.fileNames,extractComponents(u.zipFile,tmpDirectory+"/"+v,r.alias),S=!0)}).catch(u=>{vscode.window.showErrorMessage(`Error: ${JSON.stringify(u)}`),clearInterval(m)})},1e3)}),retrieve(h.accessToken,h.instanceUrl,t.packagexml).then(p=>{let f=p,m=setInterval(()=>{retrieveStatus(h.accessToken,h.instanceUrl,f).then(u=>{u.done==="true"&&(clearInterval(m),x=u.fileNames,extractComponents(u.zipFile,tmpDirectory+"/"+v,h.alias),k=!0)}).catch(u=>{vscode.window.showErrorMessage(`Error: ${JSON.stringify(u)}`),clearInterval(m)})},1e3)});let P=setInterval(()=>{S&&k&&(postCompareResults(g,x,tmpDirectory+"/"+v+"/"+r.alias,tmpDirectory+"/"+v+"/"+h.alias,e),clearInterval(P))},1e3);break;case"filePreview":let D=t.file+": Source \u2194 Target";vscode.commands.executeCommand("vscode.diff",vscode.Uri.file(t.source),vscode.Uri.file(t.dest),D,{preview:!1});break;default:console.log("Unknown command:",t.command)}}),e.onDidDispose(()=>{if(tmpDirectory&&fs.existsSync(tmpDirectory))try{fs.rmSync(tmpDirectory,{recursive:!0,force:!0})}catch{}})});a.subscriptions.push(s)}function postCompareResults(a,s,e,l,i){let n=[];a.forEach((d,o)=>{let c={name:o,source:e+"/"+d,dest:""};s.has(o)&&(c.dest=l+"/"+s.get(o)),n.push(c)}),i.webview.postMessage({command:"compareResults",files:n})}function extractComponents(a,s,e){const l=Buffer.from(a,"base64");fs.existsSync(s+"/"+e)||fs.mkdirSync(s+"/"+e,{recursive:!0});const i=path.join(s,e+".zip");fs.writeFileSync(i,l),new AdmZip(i).extractAllTo(s+"/"+e,!0)}function cancelDeploy(a,s,e){return new Promise((l,i)=>{sendSoapReuest(a,s,"<met:cancelDeploy><met:String>"+e+"</met:String></met:cancelDeploy>").then(n=>{const d=n["soapenv:Envelope"]["soapenv:Body"].cancelDeployResponse.result;l(d)}).catch(n=>{vscode.window.showErrorMessage(`Error: ${JSON.stringify(n)}`),i(n)})})}function quickDeploy(a,s,e){return new Promise((l,i)=>{sendSoapReuest(a,s,"<met:deployRecentValidation><met:validationId>"+e+"</met:validationId></met:deployRecentValidation>").then(n=>{const d=n["soapenv:Envelope"]["soapenv:Body"].deployRecentValidationResponse.result;l(d)}).catch(n=>{i(n)})})}function deployStatus(a,s,e){return new Promise((l,i)=>{sendSoapReuest(a,s,"<met:checkDeployStatus><met:asyncProcessId>"+e+"</met:asyncProcessId><met:includeDetails>true</met:includeDetails></met:checkDeployStatus>").then(n=>{const d=n["soapenv:Envelope"]["soapenv:Body"].checkDeployStatusResponse.result;l(d)}).catch(n=>{i(n)})})}function deploy(a,s,e,l,i,n){return new Promise((d,o)=>{sendSoapReuest(a,s,"<met:deploy><met:ZipFile>"+e+"</met:ZipFile><met:DeployOptions><met:checkOnly>"+l+"</met:checkOnly><met:testLevel>"+i+"</met:testLevel>"+n+"<met:singlePackage>true</met:singlePackage></met:DeployOptions></met:deploy>").then(c=>{const t=c["soapenv:Envelope"]["soapenv:Body"].deployResponse.result.id;d(t)}).catch(c=>{o(c)})})}function retrieveStatus(a,s,e){return new Promise((l,i)=>{sendSoapReuest(a,s,"<met:checkRetrieveStatus><met:asyncProcessId>"+e+"</met:asyncProcessId><met:includeZip>true</met:includeZip></met:checkRetrieveStatus>").then(n=>{const d=n["soapenv:Envelope"]["soapenv:Body"].checkRetrieveStatusResponse.result;let o=new Map;d.done==="true"&&(d.fileProperties instanceof Array?d.fileProperties:[d.fileProperties]).forEach(t=>{o.set(t.type+"."+t.fullName,t.fileName)}),l({done:d.done,zipFile:d.zipFile,fileNames:o})}).catch(n=>{i(n)})})}function retrieve(a,s,e){return new Promise((l,i)=>{sendSoapReuest(a,s,"<met:retrieve><met:retrieveRequest><met:apiVersion>62.0</met:apiVersion><met:singlePackage>true</met:singlePackage><met:unpackaged>"+e+"</met:unpackaged></met:retrieveRequest></met:retrieve>").then(n=>{const d=n["soapenv:Envelope"]["soapenv:Body"].retrieveResponse.result.id;l(d)}).catch(n=>{i(n)})})}function getComponents(a,s,e,l){return new Promise((i,n)=>{sendSoapReuest(a,s,"<met:listMetadata><met:queries><met:type>"+e+(l?"Folder":"")+"</met:type></met:queries></met:listMetadata>").then(d=>{const o=d["soapenv:Envelope"]["soapenv:Body"].listMetadataResponse;let c=buildComponents(o);if(l){let t=[];const r=c.map(h=>sendSoapReuest(a,s,"<met:listMetadata><met:queries><met:type>"+e+"</met:type><met:folder>"+h.name+"</met:folder></met:queries></met:listMetadata>").then(v=>{const y=v["soapenv:Envelope"]["soapenv:Body"].listMetadataResponse;let b=buildComponents(y);t=[...t,...b]}));Promise.all(r).then(()=>{i(t)})}else if(e==="CustomMetadata"){const t=new Set;c.forEach(v=>{t.add(v.name.split(".")[0]+"__mdt")});let r=new Map;const h=Array.from(t).map(v=>getMetdata(a,s,""+v).then(y=>{(y instanceof Array?y:[y]).forEach(g=>{r.set(g["sf:Id"]instanceof Array?g["sf:Id"][0]:g["sf:Id"],g["sf:SystemModstamp"])})}));Promise.all(h).then(()=>{c.forEach(v=>{v.lastModifiedDate=new Date(r.get(v.id)).toLocaleDateString()}),i(c)})}else i(c)}).catch(d=>{n(d)})})}function buildComponents(a){let s=[],e="1970-01-01T00:00:00.000Z";return a!==""&&(s=(a.result instanceof Array?a.result:[a.result]).map(i=>({name:i.fullName,id:i.id,type:i.type,lastModifiedByName:i.lastModifiedByName,lastModifiedDate:i.lastModifiedDate!==e?new Date(i.lastModifiedDate).toLocaleDateString():i.createdDate!==e?new Date(i.createdDate).toLocaleDateString():"",manageableState:i.manageableState===void 0?"unmanaged":i.manageableState})),s=s.filter(i=>i.id!=="")),s}function getTypes(a,s,e){let l=[];const i=path.join(e,"favorites.json");return fs.existsSync(i)&&(l=JSON.parse(fs.readFileSync(i,"utf-8"))),new Promise((n,d)=>{sendSoapReuest(a,s,"<met:describeMetadata><met:asOfVersion>62.0</met:asOfVersion></met:describeMetadata>").then(o=>{const c=o["soapenv:Envelope"]["soapenv:Body"].describeMetadataResponse.result.metadataObjects,t=[];c.forEach(r=>{t.push({name:r.xmlName,isFavorite:l.indexOf(r.xmlName)>=0,hidden:!1,inFolder:r.inFolder}),r.childXmlNames&&(r.childXmlNames instanceof Array?r.childXmlNames:[r.childXmlNames]).forEach(v=>{t.push({name:v,isFavorite:l.indexOf(r.xmlName)>=0,hidden:!1,inFolder:"false"})})}),n(t)}).catch(o=>{d(o)})})}function sendSoapReuest(a,s,e){const l=new xml2js.Parser({explicitArray:!1,ignoreAttrs:!0});let i='<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:met="http://soap.sforce.com/2006/04/metadata"><soapenv:Header><met:SessionHeader><met:sessionId>'+a+"</met:sessionId></met:SessionHeader></soapenv:Header><soapenv:Body>"+e+"</soapenv:Body></soapenv:Envelope>";return new Promise((n,d)=>{axios.post(s+"/services/Soap/m/62.0",i,{headers:{"Content-Type":"text/xml; charset=utf-8",SOAPAction:"Update"}}).then(o=>{l.parseString(o.data,(c,t)=>{if(c){vscode.window.showErrorMessage("Error parsing SOAP XML:",c);return}n(t)})}).catch(o=>{l.parseString(o.response.data,(c,t)=>{d(t["soapenv:Envelope"]["soapenv:Body"]["soapenv:Fault"].faultstring)})})})}function getMetdata(a,s,e){const l=new xml2js.Parser({explicitArray:!1,ignoreAttrs:!0});let i='<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:urn="urn:partner.soap.sforce.com"><soapenv:Header><urn:SessionHeader><urn:sessionId>'+a+"</urn:sessionId></urn:SessionHeader></soapenv:Header><soapenv:Body><urn:query><urn:queryString>SELECT Id, SystemModstamp FROM "+e+"</urn:queryString></urn:query></soapenv:Body></soapenv:Envelope>";return new Promise((n,d)=>{axios.post(s+"/services/Soap/u/62.0",i,{headers:{"Content-Type":"text/xml; charset=utf-8",SOAPAction:"Update"}}).then(o=>{l.parseString(o.data,(c,t)=>{if(c){vscode.window.showErrorMessage("Error parsing SOAP XML:",c);return}const r=t["soapenv:Envelope"]["soapenv:Body"].queryResponse.result.records;n(r instanceof Array?r:[r])})}).catch(o=>{})})}function getAuthOrgs(){return new Promise((a,s)=>{exec("sf org list --json",(e,l,i)=>{if(e)s(`Error: ${e}`);else try{const n=JSON.parse(l).result,d=[],o=[],c=[];o.push(...n.other,...n.sandboxes,...n.nonScratchOrgs,...n.devHubs,...n.scratchOrgs),o.forEach(t=>{t.connectedStatus==="Connected"&&c.indexOf(t.orgId)<0&&(d.push({name:t.alias+"("+t.username+")",alias:t.alias,orgId:t.orgId,accessToken:t.accessToken,instanceUrl:t.instanceUrl}),c.push(t.orgId))}),a(d)}catch(n){s(`Parse Error: ${n.message}`)}})})}function getWebviewContent(a,s,e){return`<!doctype html>
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
						<select type="text" class="source-org-field" id="source-org-field" style="height:36px;">
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
										<div style="padding:5px 10px 5px 10px;" id="select-all-div">
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
									<input type="text" class="date-field" id="date-field" style="height:30px;width:100px;" readonly></input>		
								</div>
								<div style="float:left;padding-left:5px;">	
									<label for="text" for="state-field" class="top-label">State: </label>
									<select type="text" class="state-field" id="state-field" style="height:36px;">
										<option value="all">All</option>
										<option value="unmanaged" selected>Unmanaged</option>
										<option value="installed">Installed</option>
									</select>		
								</div>
							</div>
							<div style="margin-top:22px;margin-left: auto;">
								<button type="button" style="padding: 7px; width: 75px;float:right;" id="next" disabled>Next</button>
								<button type="button" style="padding: 7px; width:100px;float:right;margin-right:5px" id="packagexml" disabled>Package.xml</button>	
								<div style="float: left;padding-left: 5px;margin-right: 5px;" id="selection-view">
									<div style="float:left;margin-top:-20px;margin-right: 5px;">	
										<label for="text" for="selection-list" class="top-label">Snapshots: </label>
										<select type="text" id="selection-list" style="height:33px;min-width:150px;">
										</select>		
									</div>
									<p style="float: left;margin-top: 4px;margin-right: 5px;display:none;cursor:pointer;" id="delete-selection">
										<svg width="25" height="25" viewBox="0 0 50 50" xmlns="http://www.w3.org/2000/svg">
											<circle cx="25" cy="25" r="24" fill="#f14c4c" stroke="#f14c4c" stroke-width="2"></circle>
											<line x1="17" y1="17" x2="33" y2="33" stroke="white" stroke-width="4" stroke-linecap="round"></line>
											<line x1="33" y1="17" x2="17" y2="33" stroke="white" stroke-width="4" stroke-linecap="round"></line>
										</svg>
									</p>
									<p style="float: left;margin-top: 4px;cursor:pointer;display:none;" id="add-selection">
										<svg width="25" height="25" viewBox="0 0 50 50" xmlns="http://www.w3.org/2000/svg">
											<circle cx="25" cy="25" r="24" fill="#4daafc" stroke="#4daafc" stroke-width="2"></circle>
											<line x1="25" y1="15" x2="25" y2="35" stroke="white" stroke-width="4" stroke-linecap="round"></line>
											<line x1="15" y1="25" x2="35" y2="25" stroke="white" stroke-width="4" stroke-linecap="round"></line>
										</svg>
									</p>									
								</div>
								<div style="float: left;padding-left: 5px;margin-right: 5px;display:none;" id="selection-form">
									<div style="float:left;margin-top:-20px;margin-right: 5px;">	
										<label for="text" for="selection-name" class="top-label">Selection Name: </label>
										<input type="text" id="selection-name" style="height:27px;"></input>			
									</div>	
									<p style="float: left;margin-top: 4px;margin-right: 5px;cursor:pointer;" id="save-selection">
										<svg width="25" height="25" viewBox="0 0 50 50" xmlns="http://www.w3.org/2000/svg">
											<circle cx="25" cy="25" r="24" fill="#2a6927" stroke="#2a6927" stroke-width="2"></circle>
											<polyline points="15,25 22,32 35,18" fill="none" stroke="white" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"></polyline>
										</svg>
									</p>
									<p style="float: left;margin-top: 4px;margin-right: 5px;cursor:pointer;" id="close-selection">
										<svg width="25" height="25" viewBox="0 0 50 50" xmlns="http://www.w3.org/2000/svg">
											<circle cx="25" cy="25" r="24" fill="#f14c4c" stroke="#f14c4c" stroke-width="2"></circle>
											<line x1="17" y1="17" x2="33" y2="33" stroke="white" stroke-width="4" stroke-linecap="round"></line>
											<line x1="33" y1="17" x2="17" y2="33" stroke="white" stroke-width="4" stroke-linecap="round"></line>
										</svg>
									</p>									
								</div>
							</div>
						</div>	
						<div>
							<p style="color:#f14c4c;" id="errors"></p>
						</div>				
						<div id="tabs" style="margin-top:10px;">
							<ul>
								<li class="tab" name="compsdatatable"><a href="#available" class="available">Available (0)</a></li>
								<li class="tab" name="selecteddatatable"><a href="#selected" class="selected">Selected (0)</a></li>
							</ul>
							<div id="available">
								<table id="compsdatatable" class="display" style="width:100%">
									<thead>
										<tr>
											<th><input type="checkbox" id="all-row-chk" class='all-row-chk'/></th>	
											<th>Type</th>
											<th>Name</th>
											<th>Last Modified By</th>
											<th>Last Modified Date</th>
										</tr>
									</thead>
								</table>
								<div>
									<button type="button" style="padding: 7px; width: 75px;" id="export" disabled>Export</button>
								</div>
							</div>
							<div id="selected">
								<table id="selecteddatatable" class="display" style="width:100%">
									<thead>
										<tr>	
											<th></th>	
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
								<li class="tab" name="testcoveragestable"><a href="#testcoverages" class='testcoverages'>Test Coverage</a></li>
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
							<div id="testcoverages">
								<table id="testcoveragestable">
									<thead>
										<tr>	
											<th>Class Name</th>
											<th>Coverage</th>
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
			<script src=${s}><\/script>
			<link rel="stylesheet" href=${e}>
			</html>`}function deactivate(){if(tmpDirectory&&fs.existsSync(tmpDirectory))try{fs.rmSync(tmpDirectory,{recursive:!0,force:!0})}catch{}}
