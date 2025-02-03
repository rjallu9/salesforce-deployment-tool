"use strict";var __createBinding=this&&this.__createBinding||(Object.create?function(t,s,e,i){i===void 0&&(i=e);var r=Object.getOwnPropertyDescriptor(s,e);(!r||("get"in r?!s.__esModule:r.writable||r.configurable))&&(r={enumerable:!0,get:function(){return s[e]}}),Object.defineProperty(t,i,r)}:function(t,s,e,i){i===void 0&&(i=e),t[i]=s[e]}),__setModuleDefault=this&&this.__setModuleDefault||(Object.create?function(t,s){Object.defineProperty(t,"default",{enumerable:!0,value:s})}:function(t,s){t.default=s}),__importStar=this&&this.__importStar||function(){var t=function(s){return t=Object.getOwnPropertyNames||function(e){var i=[];for(var r in e)Object.prototype.hasOwnProperty.call(e,r)&&(i[i.length]=r);return i},t(s)};return function(s){if(s&&s.__esModule)return s;var e={};if(s!=null)for(var i=t(s),r=0;r<i.length;r++)i[r]!=="default"&&__createBinding(e,s,i[r]);return __setModuleDefault(e,s),e}}();Object.defineProperty(exports,"__esModule",{value:!0}),exports.activate=activate,exports.deactivate=deactivate;const vscode=__importStar(require("vscode")),path=require("path"),axios=require("axios"),xml2js=require("xml2js"),{exec}=require("child_process"),fs=require("fs"),AdmZip=require("adm-zip");let tmpDirectory="";function activate(t){const s=vscode.commands.registerCommand("salesforce-deployment-tool.build",()=>{const e=vscode.window.createWebviewPanel("packageBuilder","Salesforce Deployment Tool",vscode.ViewColumn.One,{enableScripts:!0,retainContextWhenHidden:!0}),i=vscode.Uri.file(path.join(t.extensionPath,"out","assets/index.js")),r=e.webview.asWebviewUri(i),o=vscode.Uri.file(path.join(t.extensionPath,"out","assets/index.css")),c=e.webview.asWebviewUri(o);e.webview.html=getWebviewContent(t.extensionPath,r,c);let d=[],p=!1;tmpDirectory=t.globalStorageUri.fsPath+"/tmp",e.webview.onDidReceiveMessage(a=>{switch(a.command){case"getAuthOrgs":var g=path.join(t.globalStorageUri.fsPath,"orgsList.json");fs.existsSync(g)&&!a.refresh?(d=JSON.parse(fs.readFileSync(g,"utf-8")),e.webview.postMessage({command:"orgsList",orgs:d})):getAuthOrgs().then(n=>{d=n,e.webview.postMessage({command:"orgsList",orgs:n});const f=path.dirname(t.globalStorageUri.fsPath);fs.existsSync(f)||fs.mkdirSync(f,{recursive:!0}),fs.writeFile(t.globalStorageUri.fsPath+"/orgsList.json",JSON.stringify(d,null,2),"utf8",u=>{})});break;case"loadTypesComponents":var l=d.find(n=>n.orgId===a.sourceOrgId);validateSession(l.accessToken,l.instanceUrl,a.sourceOrgId).then(n=>{if(n.valid){n.orgsList&&(d=n.orgsList);var f=[],u=path.join(t.globalStorageUri.fsPath+"/"+l.orgId,"snapshots.json");fs.existsSync(u)&&(f=JSON.parse(fs.readFileSync(u,"utf-8")));var m=path.join(t.globalStorageUri.fsPath+"/"+l.orgId,"metadata.json");if(fs.existsSync(m)&&!a.refresh){const v=new Map(JSON.parse(fs.readFileSync(m,"utf-8"))),w=v.get("Timestamp");v.delete("Timestamp");for(const[k,I]of v)e.webview.postMessage({command:"components",components:I,type:k});e.webview.postMessage({command:"typesComponents",components:"",snapshots:f,timestamp:w})}else{const v=new Date;getTypesComponents(l.accessToken,l.instanceUrl,t.globalStorageUri.fsPath,e).then(w=>{e.webview.postMessage({command:"typesComponents",components:w,snapshots:f,timestamp:`${v.toLocaleDateString()} ${v.toLocaleTimeString()}`}),saveMetadata(w.components,w.sobjects,t.globalStorageUri.fsPath,l.orgId)})}}}).catch(n=>{e.webview.postMessage({command:"error",message:"Unable to connect to the Org."})});break;case"updateSnapshot":if(a.data){const n=path.dirname(t.globalStorageUri.fsPath+"/"+a.orgId+"/snapshots.json");fs.existsSync(n)||fs.mkdirSync(n,{recursive:!0}),fs.writeFile(t.globalStorageUri.fsPath+"/"+a.orgId+"/snapshots.json",JSON.stringify(a.data,null,2),"utf8",f=>{f&&vscode.window.showErrorMessage("Unable to update snapshots..!!")})}break;case"deploy":e.webview.postMessage({command:"deployStatus",result:{stage:"retrieve",message:"Retrieve components Initiated"}});var l=d.find(n=>n.orgId===a.sourceOrgId),h=d.find(n=>n.orgId===a.destOrgId);validateSession(h.accessToken,h.instanceUrl,a.destOrgId).then(n=>{n.valid&&retrieve(l.accessToken,l.instanceUrl,a.packagexml).then(f=>{e.webview.postMessage({command:"deployStatus",result:{stage:"retrieve",message:"Retrieve components Inprogress"}});let u=f,m=setInterval(()=>{retrieveStatus(l.accessToken,l.instanceUrl,u).then(v=>{v.done==="true"&&(e.webview.postMessage({command:"deployStatus",result:{stage:"retrieveCompleted",message:"Retrieve components Completed"}}),clearInterval(m),p?e.webview.postMessage({command:"deployStatus",result:{stage:"deployment",message:a.checkOnly?"Validation Cancelled":"Deployment Cancelled"}}):(e.webview.postMessage({command:"deployStatus",result:{stage:"deployment",message:a.checkOnly?"Validation Initiated":"Deployment Initiated"}}),deploy(h.accessToken,h.instanceUrl,v.zipFile,a.checkOnly,a.testLevel,a.testClasses).then(w=>{let k=w,I=setInterval(()=>{p&&(cancelDeploy(h.accessToken,h.instanceUrl,k),p=!1),deployStatus(h.accessToken,h.instanceUrl,k).then(P=>{P.done==="true"&&clearInterval(I),P.stage="deploymentStatus",e.webview.postMessage({command:"deployStatus",result:P})}).catch(P=>{clearInterval(I)})},2e3)})))}).catch(v=>{clearInterval(m)})},1e3)})}).catch(n=>{e.webview.postMessage({command:"previewerror",message:"Unable to connect to the Org."})});break;case"quickDeploy":var h=d.find(n=>n.orgId===a.destOrgId);e.webview.postMessage({command:"deployStatus",result:{stage:"deployment",message:"Deployment Initiated"}}),quickDeploy(h.accessToken,h.instanceUrl,a.id).then(n=>{let f=n,u=setInterval(()=>{deployStatus(h.accessToken,h.instanceUrl,f).then(m=>{m.done==="true"&&clearInterval(u),m.stage="deploymentStatus",e.webview.postMessage({command:"deployStatus",result:m})}).catch(m=>{clearInterval(u)})},2e3)});break;case"cancelDeploy":p=!0;break;case"toastMessage":vscode.window.showInformationMessage(`${a.message}`);break;case"compare":let b=new Map,x=new Map;var l=d.find(n=>n.orgId===a.sourceOrgId),h=d.find(n=>n.orgId===a.destOrgId),S=Date.now();let y=!1,D=!1;retrieve(l.accessToken,l.instanceUrl,a.packagexml).then(n=>{let f=n,u=setInterval(()=>{retrieveStatus(l.accessToken,l.instanceUrl,f).then(m=>{m.done==="true"&&(clearInterval(u),b=m.fileNames,extractComponents(m.zipFile,tmpDirectory+"/"+S,l.alias),y=!0)}).catch(m=>{vscode.window.showErrorMessage(`Error: ${JSON.stringify(m)}`),clearInterval(u)})},1e3)}),validateSession(h.accessToken,h.instanceUrl,a.destOrgId).then(n=>{n.valid&&retrieve(h.accessToken,h.instanceUrl,a.packagexml).then(f=>{let u=f,m=setInterval(()=>{retrieveStatus(h.accessToken,h.instanceUrl,u).then(v=>{v.done==="true"&&(clearInterval(m),x=v.fileNames,extractComponents(v.zipFile,tmpDirectory+"/"+S,h.alias),D=!0)}).catch(v=>{vscode.window.showErrorMessage(`Error: ${JSON.stringify(v)}`),clearInterval(m)})},1e3)})}).catch(n=>{e.webview.postMessage({command:"previewerror",message:"Unable to connect to the Org."})});let M=setInterval(()=>{y&&D&&(postCompareResults(b,x,tmpDirectory+"/"+S+"/"+l.alias,tmpDirectory+"/"+S+"/"+h.alias,e),clearInterval(M))},1e3);break;case"filePreview":let E=a.file+": Source \u2194 Target";vscode.commands.executeCommand("vscode.diff",vscode.Uri.file(a.source),vscode.Uri.file(a.dest),E,{preview:!1});break;default:console.log("Unknown command:",a.command)}}),e.onDidDispose(()=>{if(tmpDirectory&&fs.existsSync(tmpDirectory))try{fs.rmSync(tmpDirectory,{recursive:!0,force:!0})}catch{}})});t.subscriptions.push(s)}function validateSession(t,s,e){return new Promise((i,r)=>{sendSoapAPIRequest(t,s,"<urn:getUserInfo/>").then(o=>{i({valid:!0})}).catch(o=>{if(o.indexOf("INVALID_SESSION_ID")>=0){let d=function(){c++,getAuthOrgs().then(p=>{let a=p.find(g=>g.orgId===e);return sendSoapAPIRequest(a.accessToken,a.instanceUrl,"<urn:getUserInfo/>").then(g=>{i({valid:!0,orgsList:p})}).catch(g=>{c<5?d():r(new Error("Max retries reached. Session validation failed."))})})},c=0;d()}})})}function saveMetadata(t,s,e,i){Array.from(s.values()).flat().forEach(c=>{t.get("CustomField").push({name:c,type:"CustomField",lastModifiedByName:"",lastModifiedDate:""})});const r=new Date;t.set("Timestamp",`${r.toLocaleDateString()} ${r.toLocaleTimeString()}`);const o=path.dirname(e+"/"+i+"/metadata.json");fs.existsSync(o)||fs.mkdirSync(o,{recursive:!0}),fs.writeFile(e+"/"+i+"/metadata.json",JSON.stringify(Array.from(t),null,2),"utf8",c=>{c&&vscode.window.showErrorMessage(`Error..!! ${c}`)})}function postCompareResults(t,s,e,i,r){let o=[];t.forEach((c,d)=>{let p={name:d,source:e+"/"+c,dest:""};s.has(d)&&(p.dest=i+"/"+s.get(d)),o.push(p)}),r.webview.postMessage({command:"compareResults",files:o})}function extractComponents(t,s,e){const i=Buffer.from(t,"base64");fs.existsSync(s+"/"+e)||fs.mkdirSync(s+"/"+e,{recursive:!0});const r=path.join(s,e+".zip");fs.writeFileSync(r,i),new AdmZip(r).extractAllTo(s+"/"+e,!0)}function cancelDeploy(t,s,e){return new Promise((i,r)=>{sendSoapMDRequest(t,s,"<met:cancelDeploy><met:String>"+e+"</met:String></met:cancelDeploy>").then(o=>{const c=o.cancelDeployResponse.result;i(c)}).catch(o=>{vscode.window.showErrorMessage(`Error: ${JSON.stringify(o)}`),r(o)})})}function quickDeploy(t,s,e){return new Promise((i,r)=>{sendSoapMDRequest(t,s,"<met:deployRecentValidation><met:validationId>"+e+"</met:validationId></met:deployRecentValidation>").then(o=>{const c=o.deployRecentValidationResponse.result;i(c)}).catch(o=>{r(o)})})}function deployStatus(t,s,e){return new Promise((i,r)=>{sendSoapMDRequest(t,s,"<met:checkDeployStatus><met:asyncProcessId>"+e+"</met:asyncProcessId><met:includeDetails>true</met:includeDetails></met:checkDeployStatus>").then(o=>{const c=o.checkDeployStatusResponse.result;i(c)}).catch(o=>{r(o)})})}function deploy(t,s,e,i,r,o){return new Promise((c,d)=>{sendSoapMDRequest(t,s,"<met:deploy><met:ZipFile>"+e+"</met:ZipFile><met:DeployOptions><met:checkOnly>"+i+"</met:checkOnly><met:testLevel>"+r+"</met:testLevel>"+o+"<met:singlePackage>true</met:singlePackage></met:DeployOptions></met:deploy>").then(p=>{const a=p.deployResponse.result.id;c(a)}).catch(p=>{d(p)})})}function retrieveStatus(t,s,e){return new Promise((i,r)=>{sendSoapMDRequest(t,s,"<met:checkRetrieveStatus><met:asyncProcessId>"+e+"</met:asyncProcessId><met:includeZip>true</met:includeZip></met:checkRetrieveStatus>").then(o=>{const c=o.checkRetrieveStatusResponse.result;let d=new Map;c.done==="true"&&(c.fileProperties instanceof Array?c.fileProperties:[c.fileProperties]).forEach(a=>{d.set(a.type+"."+a.fullName,a.fileName)}),i({done:c.done,zipFile:c.zipFile,fileNames:d})}).catch(o=>{r(o)})})}function retrieve(t,s,e){return new Promise((i,r)=>{sendSoapMDRequest(t,s,"<met:retrieve><met:retrieveRequest><met:apiVersion>62.0</met:apiVersion><met:singlePackage>true</met:singlePackage><met:unpackaged>"+e+"</met:unpackaged></met:retrieveRequest></met:retrieve>").then(o=>{const c=o.retrieveResponse.result.id;i(c)}).catch(o=>{r(o)})})}function getTypesComponents(t,s,e,i){return new Promise((r,o)=>{let c=new Map,d=new Map;sendSoapMDRequest(t,s,"<met:describeMetadata><met:asOfVersion>62.0</met:asOfVersion></met:describeMetadata>").then(p=>{const a=p.describeMetadataResponse.result.metadataObjects,g=[];a.forEach(l=>{g.push({name:l.xmlName,inFolder:l.inFolder}),l.childXmlNames&&(l.childXmlNames instanceof Array?l.childXmlNames:[l.childXmlNames]).forEach(S=>{g.push({name:S,inFolder:"false"})})}),i.webview.postMessage({command:"loading",message:"Refreshing Components(0/"+g.length+")"}),Promise.all(g.map(l=>sendSoapMDRequest(t,s,"<met:listMetadata><met:queries><met:type>"+(l.inFolder==="true"?l.name==="EmailTemplate"?"EmailFolder":l.name+"Folder":l.name)+"</met:type></met:queries></met:listMetadata>").then(h=>{const S=h.listMetadataResponse;let b=buildComponents(S);if(l.inFolder==="true"){let x=[];return Promise.all(b.map(y=>sendSoapMDRequest(t,s,"<met:listMetadata><met:queries><met:type>"+l.name+"</met:type><met:folder>"+y.name+"</met:folder></met:queries></met:listMetadata>").then(D=>{const M=D.listMetadataResponse;let E=buildComponents(M);y.type=l.name,x=[...x,...E,y]}))).then(()=>{c.set(l.name,x),i.webview.postMessage({command:"loading",message:"Refreshing Components("+c.size+"/"+g.length+")"}),i.webview.postMessage({command:"components",components:x,type:l.name})}).catch(y=>{vscode.window.showErrorMessage(`Error ${y}`)})}else if(l.name==="CustomObject"){c.set(l.name,b),i.webview.postMessage({command:"components",components:b,type:l.name});const x=new Set(b.map(y=>y.name));return sendSoapAPIRequest(t,s,"<urn:describeGlobal/>").then(y=>{const D=y.describeGlobalResponse.result.sobjects;let M=[];D.forEach(n=>{n.custom==="false"&&x.has(n.name)&&M.push(n.name)});const E=[];for(let n=0;n<M.length;n+=100)E.push(M.slice(n,n+100));return Promise.all(E.map(n=>{var f="";return n.forEach(u=>{f+="<urn:sObjectType>"+u+"</urn:sObjectType>"}),sendSoapAPIRequest(t,s,"<urn:describeSObjects>"+f+"</urn:describeSObjects>").then(u=>{const m=u.describeSObjectsResponse.result,v=new Set(["Id","IsDeleted","CreatedById","CreatedDate","LastModifiedById","LastModifiedDate","LastReferencedDate","LastViewedDate","SystemModstamp"]);m.forEach(w=>{let k=[];w.fields.forEach(I=>{I.custom==="false"&&!v.has(I.name)&&k.push(w.name+"."+I.name)}),d.set(w.name,k),i.webview.postMessage({command:"stdFields",name:w.name,fields:k})})}).catch(u=>{vscode.window.showErrorMessage(`Error ${u}`)})})).then(()=>{}).catch(n=>{vscode.window.showErrorMessage(`Error ${n}`)})}).catch(y=>{vscode.window.showErrorMessage(`Error ${y}`)})}else c.set(l.name,b),i.webview.postMessage({command:"loading",message:"Refreshing Components("+c.size+"/"+g.length+")"}),i.webview.postMessage({command:"components",components:b,type:l.name})}).catch(h=>{vscode.window.showErrorMessage(`Error ${h}`)}))).then(()=>{r({components:c,sobjects:d})}).catch(l=>{vscode.window.showErrorMessage(`Error ${l}`)})}).catch(p=>{o(p)})})}function buildComponents(t){let s=[],e="1970-01-01T00:00:00.000Z";return t!==""&&(s=(t.result instanceof Array?t.result:[t.result]).map(r=>({name:r.fullName,type:r.type,lastModifiedByName:r.lastModifiedByName,lastModifiedDate:r.lastModifiedDate!==e?new Date(r.lastModifiedDate).toLocaleDateString():r.createdDate!==e?new Date(r.createdDate).toLocaleDateString():""})),s=Array.from(new Map(s.map(r=>[r.type+r.name,r])).values())),s}function sendSoapMDRequest(t,s,e){const i=new xml2js.Parser({explicitArray:!1,ignoreAttrs:!0});let r='<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:met="http://soap.sforce.com/2006/04/metadata"><soapenv:Header><met:SessionHeader><met:sessionId>'+t+"</met:sessionId></met:SessionHeader></soapenv:Header><soapenv:Body>"+e+"</soapenv:Body></soapenv:Envelope>";return new Promise((o,c)=>{axios.post(s+"/services/Soap/m/62.0",r,{headers:{"Content-Type":"text/xml; charset=utf-8",SOAPAction:"Update"}}).then(d=>{i.parseString(d.data,(p,a)=>{if(p){vscode.window.showErrorMessage("Error parsing SOAP XML:",p);return}o(a["soapenv:Envelope"]["soapenv:Body"])})}).catch(d=>{i.parseString(d.response.data,(p,a)=>{c(a["soapenv:Envelope"]["soapenv:Body"]["soapenv:Fault"].faultstring)})})})}function sendSoapAPIRequest(t,s,e){const i=new xml2js.Parser({explicitArray:!1,ignoreAttrs:!0});let r='<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:urn="urn:partner.soap.sforce.com"><soapenv:Header><urn:SessionHeader><urn:sessionId>'+t+"</urn:sessionId></urn:SessionHeader></soapenv:Header><soapenv:Body>"+e+"</soapenv:Body></soapenv:Envelope>";return new Promise((o,c)=>{axios.post(s+"/services/Soap/u/62.0",r,{headers:{"Content-Type":"text/xml; charset=utf-8",SOAPAction:"Update"}}).then(d=>{i.parseString(d.data,(p,a)=>{if(p){vscode.window.showErrorMessage("Error parsing SOAP XML:",p);return}o(a["soapenv:Envelope"]["soapenv:Body"])})}).catch(d=>{i.parseString(d.response.data,(p,a)=>{c(a["soapenv:Envelope"]["soapenv:Body"]["soapenv:Fault"].faultstring)})})})}function getAuthOrgs(){return new Promise((t,s)=>{exec("sf org list --json",(e,i,r)=>{if(e)s(`Error: ${e}`);else try{const o=JSON.parse(i).result,c=[],d=[],p=[];d.push(...o.other,...o.sandboxes,...o.nonScratchOrgs,...o.devHubs,...o.scratchOrgs),d.forEach(a=>{a.connectedStatus==="Connected"&&p.indexOf(a.orgId)<0&&(c.push({name:a.alias+"("+a.username+")",alias:a.alias,orgId:a.orgId,accessToken:a.accessToken,instanceUrl:a.instanceUrl}),p.push(a.orgId))}),t(c)}catch(o){s(`Parse Error: ${o.message}`)}})})}function refreshOrgs(){return new Promise((t,s)=>{const e=path.join(process.env.HOME||process.env.USERPROFILE||"",".sfdx"),i=JSON.parse(fs.readFileSync(e+"/alias.json","utf-8"));console.log(i.orgs)})}function getWebviewContent(t,s,e){return`<!doctype html>
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
					<div style="display:flex;">			
						<div id="source-org" style="margin-right:5px;display:none;">	
							<label for="text" for="source-org-field" class="top-label">Source Org:</label>
							<select type="text" class="source-org-field" id="source-org-field" style="height:36px;">
							</select>		
						</div>
						<div>
							<p id="source-org-refresh" style="margin-bottom:0;margin-top:25px;margin-right:5px;cursor:pointer;display:none;" title="Refresh Orgs">
								<svg width="25" height="25" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
									<circle cx="512" cy="512" r="512" fill="#0078d4"></circle>
									<path d="M512 281.6c71.221 0 136.396 32.619 179.2 85.526V256h51.2v204.8H537.6v-51.2h121.511c-32.857-47.165-87.235-76.8-147.111-76.8-98.97 0-179.2 80.23-179.2 179.2 0 98.97 80.23 179.2 179.2 179.2v-.02c73.665 0 138.994-44.857 166.176-111.988l47.458 19.216C690.689 684.711 606.7 742.38 512 742.38v.02c-127.246 0-230.4-103.154-230.4-230.4 0-127.246 103.154-230.4 230.4-230.4z" fill="white" fill-rule="nonzero"></path>
								</svg>
							</p>
						</div>
						<div id="actions" style="display:none;flex:1;">
							<div class="form-panel">
								<div>
									<div style="float:left;" >
										<div>	
											<label for="text" for="dd-text-field" class="top-label">Type: </label>
											<input type="text" class="dd-text-field" id="dd-text-field"></input>								
											<span style="margin-left: -19px;color: #888;">
												<svg width="15" height="15" viewBox="0 0 24 12" fill="#cccccc;" xmlns="http://www.w3.org/2000/svg" style="color: #cccccc;">
													<path d="M6 9l6 6 6-6" stroke="#cccccc" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"></path>
												</svg>
											</span>
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
								</div>
								<div style="margin-top:22px;margin-left: auto;">
									<button type="button" style="width: 75px;float:right;" id="next" disabled>Next</button>
									<button type="button" style="width:100px;float:right;margin-right:5px" id="packagexml" disabled>Package.xml</button>	
									<div style="float: left;padding-left: 5px;margin-right: 5px;" id="snapshot-view">
										<div style="float:left;margin-top:-20px;margin-right: 5px;">	
											<label for="text" for="snapshot-list" class="top-label">Snapshots: </label>
											<select type="text" id="snapshot-list" style="height:33px;min-width:150px;">
											</select>		
										</div>
										<p title="Update Snapshot" style="float: left;margin-bottom:0;margin-top: 4px;margin-right: 5px;display:none;cursor:pointer;" id="update-snapshot">
											<svg width="25" height="25" viewBox="0 0 50 50" xmlns="http://www.w3.org/2000/svg">
												<circle cx="25" cy="25" r="24" fill="#2a6927" stroke="#2a6927" stroke-width="2"></circle>
												<polyline points="15,25 22,32 35,18" fill="none" stroke="white" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"></polyline>
											</svg>
										</p>
										<p title="Delete Snapshot" style="float: left;margin-bottom:0;margin-top: 4px;margin-right: 5px;display:none;cursor:pointer;" id="delete-snapshot">
											<svg width="25" height="25" viewBox="0 0 50 50" xmlns="http://www.w3.org/2000/svg">
												<circle cx="25" cy="25" r="24" fill="#f14c4c" stroke="#f14c4c" stroke-width="2"></circle>
												<line x1="17" y1="17" x2="33" y2="33" stroke="white" stroke-width="4" stroke-linecap="round"></line>
												<line x1="33" y1="17" x2="17" y2="33" stroke="white" stroke-width="4" stroke-linecap="round"></line>
											</svg>
										</p>
										<p title="Add Snapshot" style="float: left;margin-bottom:0;margin-top: 4px;cursor:pointer;display:none;" id="add-snapshot">
											<svg width="25" height="25" viewBox="0 0 50 50" xmlns="http://www.w3.org/2000/svg">
												<circle cx="25" cy="25" r="24" fill="#0078d4" stroke="#0078d4" stroke-width="2"></circle>
												<line x1="25" y1="15" x2="25" y2="35" stroke="white" stroke-width="4" stroke-linecap="round"></line>
												<line x1="15" y1="25" x2="35" y2="25" stroke="white" stroke-width="4" stroke-linecap="round"></line>
											</svg>
										</p>									
									</div>
									<div style="float: left;padding-left: 5px;margin-right: 5px;display:none;" id="snapshot-form">
										<div style="float:left;margin-top:-20px;margin-right: 5px;">	
											<label for="text" for="snapshot-name" class="top-label">Snapshot Name: </label>
											<input type="text" id="snapshot-name" style="height:27px;border:1px solid rgb(118, 118, 118);"></input>			
										</div>	
										<p title="Save Snapshot" style="float: left;margin-bottom:0;margin-top: 4px;margin-right: 5px;cursor:pointer;" id="save-snapshot">
											<svg width="25" height="25" viewBox="0 0 50 50" xmlns="http://www.w3.org/2000/svg">
												<circle cx="25" cy="25" r="24" fill="#2a6927" stroke="#2a6927" stroke-width="2"></circle>
												<polyline points="15,25 22,32 35,18" fill="none" stroke="white" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"></polyline>
											</svg>
										</p>
										<p title="Close Snapshot" style="float: left;margin-bottom:0;margin-top: 4px;margin-right: 5px;cursor:pointer;" id="close-snapshot">
											<svg width="25" height="25" viewBox="0 0 50 50" xmlns="http://www.w3.org/2000/svg">
												<circle cx="25" cy="25" r="24" fill="#f14c4c" stroke="#f14c4c" stroke-width="2"></circle>
												<line x1="17" y1="17" x2="33" y2="33" stroke="white" stroke-width="4" stroke-linecap="round"></line>
												<line x1="33" y1="17" x2="17" y2="33" stroke="white" stroke-width="4" stroke-linecap="round"></line>
											</svg>
										</p>									
									</div>
								</div>
							</div>					
						</div>
					</div>
					<p style="color:#f14c4c;margin-bottom:0;margin-top:5px;" id="errors"></p>
					<p id="refresh-lbl" style="display:none;">
						<span id="refreshlabel">Last Refresh Date:</span>. Please click <a href="#" id="hard-refresh">here</a> to refresh.
					</p>
					<div id="selectiontabs" style="margin-top:10px;display:none;">
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
								<button type="button" style="width: 75px;" id="export" disabled>Export All</button>
								<button type="button" style="width: 110px;" id="exportselected" disabled>Export Selected</button>
								<button type="button" style="width: 110px;" id="bulkselection" disabled>Bulk Selection</button>
								<div id="bulkselection-dialog" title="Bulk Selection">
									<p>Provide the names of the components in the format type.name(ex. CustomField.Account.Phone) in a new line.</p>
									<textarea id="bulk-comps" name="bulk-comps" rows="18" style="line-height:20px;scrollbar-width:thin;resize:none;width:100%;"></textarea>
									<div id="bulkerrors" style="display:none;">
										<p style="color: red;font-weight: bold;margin-bottom:0;">Errors:</p>
										<textarea class="errors" rows="9" cols="66" style="line-height: 20px;scrollbar-width:thin;resize: none;"></textarea>
									</div>									
									<button type="button" style="width:50px;float:right;padding: 5px;margin-right:-4px;" id="bulkselect">Select</button>
									<button type="button" style="width:70px;float:right;margin-right:5px;display:none;" id="bulkcontinue">Continue</button>
								</div>
							</div>
						</div>
						<div id="selected">
							<table id="selecteddatatable" class="display" style="width:100%">
								<thead>
									<tr>	
										<th><input type="checkbox" id="deleteall-row-chk" class="deleteall-row-chk"/></th>	
										<th>Type</th>
										<th>Name</th>
										<th>Last Modified By</th>
										<th>Last Modified Date</th>
									</tr>
								</thead>
							</table>
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
								<button type="button" style="width: 75px;float:right;margin-top:22px;margin-left: 5px;" id="compare">Compare</button>											
								<button type="button" style="width: 75px;float:right;margin-top:22px;margin-left: 5px;" id="deploy">Deploy</button>
								<button type="button" style="width: 75px;float:right;margin-top:22px;margin-left: 5px;" id="validate">Validate</button>	
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
								<button type="button" style="width: 75px;margin-top:22px;" id="previous">Back</button>							
							</div>	
						</div>
						<p style="color:#f14c4c;margin-bottom:0;margin-top:5px;" id="previewerrors"></p>
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
								<textarea id="test-classes" name="test-classes" rows="15" style="line-height:20px;scrollbar-width:thin;resize:none;width:100%;"></textarea>
								<button type="button" style="width:50px;float:right;padding: 5px;margin-right:-4px;" id="save-classes">Save</button>
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
				<div id="spinner" class="spinner">
					<div class="cv-spinner">
						<span class="spinner-circle"></span>
						<p style="margin-left: 5px;" class="spinnerlabel">Initializing</p>
					</div>
				</div>
			</body>
			<script src=${s}><\/script>
			<link rel="stylesheet" href=${e}>
			</html>`}function deactivate(){if(tmpDirectory&&fs.existsSync(tmpDirectory))try{fs.rmSync(tmpDirectory,{recursive:!0,force:!0})}catch{}}
