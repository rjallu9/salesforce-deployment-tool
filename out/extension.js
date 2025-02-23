"use strict";var __createBinding=this&&this.__createBinding||(Object.create?function(t,s,e,a){a===void 0&&(a=e);var o=Object.getOwnPropertyDescriptor(s,e);(!o||("get"in o?!s.__esModule:o.writable||o.configurable))&&(o={enumerable:!0,get:function(){return s[e]}}),Object.defineProperty(t,a,o)}:function(t,s,e,a){a===void 0&&(a=e),t[a]=s[e]}),__setModuleDefault=this&&this.__setModuleDefault||(Object.create?function(t,s){Object.defineProperty(t,"default",{enumerable:!0,value:s})}:function(t,s){t.default=s}),__importStar=this&&this.__importStar||function(){var t=function(s){return t=Object.getOwnPropertyNames||function(e){var a=[];for(var o in e)Object.prototype.hasOwnProperty.call(e,o)&&(a[a.length]=o);return a},t(s)};return function(s){if(s&&s.__esModule)return s;var e={};if(s!=null)for(var a=t(s),o=0;o<a.length;o++)a[o]!=="default"&&__createBinding(e,s,a[o]);return __setModuleDefault(e,s),e}}(),__importDefault=this&&this.__importDefault||function(t){return t&&t.__esModule?t:{default:t}};Object.defineProperty(exports,"__esModule",{value:!0}),exports.activate=activate,exports.deactivate=deactivate;const vscode=__importStar(require("vscode")),stdValueSet_json_1=__importDefault(require("./assets/stdValueSet.json")),path=require("path"),axios=require("axios"),xml2js=require("xml2js"),{exec}=require("child_process"),fs=require("fs"),AdmZip=require("adm-zip");let tmpDirectory="",STD_VALUE_SET=stdValueSet_json_1.default;function activate(t){const s=vscode.commands.registerCommand("salesforce-deployment-tool.build",()=>{const e=vscode.window.createWebviewPanel("packageBuilder","Salesforce Deployment Tool",vscode.ViewColumn.One,{enableScripts:!0,retainContextWhenHidden:!0}),a=vscode.Uri.file(path.join(t.extensionPath,"out","assets/index.js")),o=e.webview.asWebviewUri(a),r=vscode.Uri.file(path.join(t.extensionPath,"out","assets/index.css")),d=e.webview.asWebviewUri(r);e.webview.html=getWebviewContent(t.extensionPath,o,d);let c=[],p=!1;tmpDirectory=t.globalStorageUri.fsPath+"/tmp",e.webview.onDidReceiveMessage(i=>{switch(i.command){case"getAuthOrgs":var g=path.join(t.globalStorageUri.fsPath,"orgsList.json");fs.existsSync(g)&&!i.refresh?(c=JSON.parse(fs.readFileSync(g,"utf-8")),e.webview.postMessage({command:"orgsList",orgs:c})):getAuthOrgs().then(l=>{c=l,e.webview.postMessage({command:"orgsList",orgs:l});const f=path.dirname(t.globalStorageUri.fsPath);fs.existsSync(f)||fs.mkdirSync(f,{recursive:!0}),fs.writeFile(t.globalStorageUri.fsPath+"/orgsList.json",JSON.stringify(c,null,2),"utf8",v=>{})});break;case"loadTypesComponents":var n=c.find(l=>l.orgId===i.sourceOrgId);validateSession(n.accessToken,n.instanceUrl,i.sourceOrgId).then(l=>{if(l.valid){l.orgsList&&(c=l.orgsList,n=c.find(u=>u.orgId===i.sourceOrgId),fs.writeFile(t.globalStorageUri.fsPath+"/orgsList.json",JSON.stringify(c,null,2),"utf8",u=>{}));var f=[],v=path.join(t.globalStorageUri.fsPath+"/"+n.orgId,"snapshots.json");fs.existsSync(v)&&(f=JSON.parse(fs.readFileSync(v,"utf-8")));var m=path.join(t.globalStorageUri.fsPath+"/"+n.orgId,"metadata.json");if(fs.existsSync(m)&&!i.refresh){const u=new Map(JSON.parse(fs.readFileSync(m,"utf-8"))),w=u.get("Timestamp");u.delete("Timestamp");for(const[I,S]of u)e.webview.postMessage({command:"components",components:S,type:I});e.webview.postMessage({command:"typesComponents",components:"",snapshots:f,timestamp:w})}else{const u=new Date;getTypesComponents(n.accessToken,n.instanceUrl,t.globalStorageUri.fsPath,e).then(w=>{e.webview.postMessage({command:"typesComponents",components:w,snapshots:f,timestamp:`${u.toLocaleDateString()} ${u.toLocaleTimeString()}`}),saveMetadata(w.components,w.sobjects,t.globalStorageUri.fsPath,n.orgId)})}}}).catch(l=>{e.webview.postMessage({command:"error",message:"Unable to connect to the Org."})});break;case"updateSnapshot":if(i.data){const l=path.dirname(t.globalStorageUri.fsPath+"/"+i.orgId+"/snapshots.json");fs.existsSync(l)||fs.mkdirSync(l,{recursive:!0}),fs.writeFile(t.globalStorageUri.fsPath+"/"+i.orgId+"/snapshots.json",JSON.stringify(i.data,null,2),"utf8",f=>{f&&vscode.window.showErrorMessage("Unable to update snapshots..!!")})}break;case"deploy":e.webview.postMessage({command:"deployStatus",result:{stage:"retrieve",message:"Retrieve components Initiated"}});var n=c.find(l=>l.orgId===i.sourceOrgId),h=c.find(l=>l.orgId===i.destOrgId);validateSession(h.accessToken,h.instanceUrl,i.destOrgId).then(l=>{l.valid&&retrieve(n.accessToken,n.instanceUrl,i.packagexml).then(f=>{e.webview.postMessage({command:"deployStatus",result:{stage:"retrieve",message:"Retrieve components Inprogress"}});let v=f,m=setInterval(()=>{retrieveStatus(n.accessToken,n.instanceUrl,v).then(u=>{u.done==="true"&&(e.webview.postMessage({command:"deployStatus",result:{stage:"retrieveCompleted",message:"Retrieve components Completed"}}),clearInterval(m),p?e.webview.postMessage({command:"deployStatus",result:{stage:"deployment",message:i.checkOnly?"Validation Cancelled":"Deployment Cancelled"}}):(e.webview.postMessage({command:"deployStatus",result:{stage:"deployment",message:i.checkOnly?"Validation Initiated":"Deployment Initiated"}}),deploy(h.accessToken,h.instanceUrl,u.zipFile,i.checkOnly,i.testLevel,i.testClasses).then(w=>{let I=w,S=setInterval(()=>{p&&(cancelDeploy(h.accessToken,h.instanceUrl,I),p=!1),deployStatus(h.accessToken,h.instanceUrl,I).then(P=>{P.done==="true"&&clearInterval(S),P.stage="deploymentStatus",e.webview.postMessage({command:"deployStatus",result:P})}).catch(P=>{clearInterval(S)})},2e3)})))}).catch(u=>{clearInterval(m)})},1e3)})}).catch(l=>{e.webview.postMessage({command:"previewerror",message:"Unable to connect to the Org."})});break;case"quickDeploy":var h=c.find(l=>l.orgId===i.destOrgId);e.webview.postMessage({command:"deployStatus",result:{stage:"deployment",message:"Deployment Initiated"}}),quickDeploy(h.accessToken,h.instanceUrl,i.id).then(l=>{let f=l,v=setInterval(()=>{deployStatus(h.accessToken,h.instanceUrl,f).then(m=>{m.done==="true"&&clearInterval(v),m.stage="deploymentStatus",e.webview.postMessage({command:"deployStatus",result:m})}).catch(m=>{clearInterval(v)})},2e3)});break;case"cancelDeploy":p=!0;break;case"toastMessage":vscode.window.showInformationMessage(`${i.message}`);break;case"compare":let b=new Map,x=new Map;var n=c.find(l=>l.orgId===i.sourceOrgId),h=c.find(l=>l.orgId===i.destOrgId),k=Date.now();let y=!1,D=!1;retrieve(n.accessToken,n.instanceUrl,i.packagexml).then(l=>{let f=l,v=setInterval(()=>{retrieveStatus(n.accessToken,n.instanceUrl,f).then(m=>{m.done==="true"&&(clearInterval(v),b=m.fileNames,extractComponents(m.zipFile,tmpDirectory+"/"+k,n.alias),y=!0)}).catch(m=>{vscode.window.showErrorMessage(`Error: ${JSON.stringify(m)}`),clearInterval(v)})},1e3)}),validateSession(h.accessToken,h.instanceUrl,i.destOrgId).then(l=>{l.valid&&retrieve(h.accessToken,h.instanceUrl,i.packagexml).then(f=>{let v=f,m=setInterval(()=>{retrieveStatus(h.accessToken,h.instanceUrl,v).then(u=>{u.done==="true"&&(clearInterval(m),x=u.fileNames,extractComponents(u.zipFile,tmpDirectory+"/"+k,h.alias),D=!0)}).catch(u=>{vscode.window.showErrorMessage(`Error: ${JSON.stringify(u)}`),clearInterval(m)})},1e3)})}).catch(l=>{e.webview.postMessage({command:"previewerror",message:"Unable to connect to the Org."})});let M=setInterval(()=>{y&&D&&(postCompareResults(b,x,tmpDirectory+"/"+k+"/"+n.alias,tmpDirectory+"/"+k+"/"+h.alias,e),clearInterval(M))},1e3);break;case"filePreview":let E=i.file+": Source \u2194 Target";vscode.commands.executeCommand("vscode.diff",vscode.Uri.file(i.source),vscode.Uri.file(i.dest),E,{preview:!1}),i.scrollTo!==""&&setTimeout(()=>scrollTo(i.scrollTo),1e3);break;default:console.log("Unknown command:",i.command)}}),e.onDidDispose(()=>{if(tmpDirectory&&fs.existsSync(tmpDirectory))try{fs.rmSync(tmpDirectory,{recursive:!0,force:!0})}catch{}})});t.subscriptions.push(s)}async function scrollTo(t){const s=vscode.window.activeTextEditor;if(!s)return;const e=s.document,a=e.getText().indexOf(t);if(a===-1)return;const o=e.positionAt(a),r=new vscode.Range(o,o);s.selection=new vscode.Selection(o,o),s.revealRange(r,vscode.TextEditorRevealType.InCenter)}function validateSession(t,s,e){return new Promise((a,o)=>{sendSoapAPIRequest(t,s,"<urn:getUserInfo/>").then(r=>{a({valid:!0})}).catch(r=>{if(r.indexOf("INVALID_SESSION_ID")>=0){let c=function(){d++,getAuthOrgs().then(p=>{let i=p.find(g=>g.orgId===e);return sendSoapAPIRequest(i.accessToken,i.instanceUrl,"<urn:getUserInfo/>").then(g=>{a({valid:!0,orgsList:p})}).catch(g=>{d<5?c():o(new Error("Max retries reached. Session validation failed."))})})},d=0;c()}})})}function saveMetadata(t,s,e,a){Array.from(s.values()).flat().forEach(d=>{t.get("CustomField").push({name:d,type:"CustomField",lastModifiedByName:"",lastModifiedDate:"",parent:"CustomObject"})});const o=new Date;t.set("Timestamp",`${o.toLocaleDateString()} ${o.toLocaleTimeString()}`);const r=path.dirname(e+"/"+a+"/metadata.json");fs.existsSync(r)||fs.mkdirSync(r,{recursive:!0}),fs.writeFile(e+"/"+a+"/metadata.json",JSON.stringify(Array.from(t),null,2),"utf8",d=>{d&&vscode.window.showErrorMessage(`Error..!! ${d}`)})}function postCompareResults(t,s,e,a,o){let r=[];t.forEach((d,c)=>{let p={name:c,source:e+"/"+d,dest:""};s.has(c)&&(p.dest=a+"/"+s.get(c)),r.push(p)}),o.webview.postMessage({command:"compareResults",files:r})}function extractComponents(t,s,e){const a=Buffer.from(t,"base64");fs.existsSync(s+"/"+e)||fs.mkdirSync(s+"/"+e,{recursive:!0});const o=path.join(s,e+".zip");fs.writeFileSync(o,a),new AdmZip(o).extractAllTo(s+"/"+e,!0)}function cancelDeploy(t,s,e){return new Promise((a,o)=>{sendSoapMDRequest(t,s,"<met:cancelDeploy><met:String>"+e+"</met:String></met:cancelDeploy>").then(r=>{const d=r.cancelDeployResponse.result;a(d)}).catch(r=>{vscode.window.showErrorMessage(`Error: ${JSON.stringify(r)}`),o(r)})})}function quickDeploy(t,s,e){return new Promise((a,o)=>{sendSoapMDRequest(t,s,"<met:deployRecentValidation><met:validationId>"+e+"</met:validationId></met:deployRecentValidation>").then(r=>{const d=r.deployRecentValidationResponse.result;a(d)}).catch(r=>{o(r)})})}function deployStatus(t,s,e){return new Promise((a,o)=>{sendSoapMDRequest(t,s,"<met:checkDeployStatus><met:asyncProcessId>"+e+"</met:asyncProcessId><met:includeDetails>true</met:includeDetails></met:checkDeployStatus>").then(r=>{const d=r.checkDeployStatusResponse.result;a(d)}).catch(r=>{o(r)})})}function deploy(t,s,e,a,o,r){return new Promise((d,c)=>{sendSoapMDRequest(t,s,"<met:deploy><met:ZipFile>"+e+"</met:ZipFile><met:DeployOptions><met:checkOnly>"+a+"</met:checkOnly><met:testLevel>"+o+"</met:testLevel>"+r+"<met:singlePackage>true</met:singlePackage></met:DeployOptions></met:deploy>").then(p=>{const i=p.deployResponse.result.id;d(i)}).catch(p=>{c(p)})})}function retrieveStatus(t,s,e){return new Promise((a,o)=>{sendSoapMDRequest(t,s,"<met:checkRetrieveStatus><met:asyncProcessId>"+e+"</met:asyncProcessId><met:includeZip>true</met:includeZip></met:checkRetrieveStatus>").then(r=>{const d=r.checkRetrieveStatusResponse.result;let c=new Map;d.done==="true"&&(d.fileProperties instanceof Array?d.fileProperties:[d.fileProperties]).forEach(i=>{c.set(i.type+"."+i.fullName,i.fileName)}),a({done:d.done,zipFile:d.zipFile,fileNames:c})}).catch(r=>{o(r)})})}function retrieve(t,s,e){return new Promise((a,o)=>{sendSoapMDRequest(t,s,"<met:retrieve><met:retrieveRequest><met:apiVersion>62.0</met:apiVersion><met:singlePackage>true</met:singlePackage><met:unpackaged>"+e+"</met:unpackaged></met:retrieveRequest></met:retrieve>").then(r=>{const d=r.retrieveResponse.result.id;a(d)}).catch(r=>{o(r)})})}function getTypesComponents(t,s,e,a){return new Promise((o,r)=>{let d=new Map,c=new Map;sendSoapMDRequest(t,s,"<met:describeMetadata><met:asOfVersion>62.0</met:asOfVersion></met:describeMetadata>").then(p=>{const i=p.describeMetadataResponse.result.metadataObjects,g=[];i.forEach(n=>{g.push({name:n.xmlName,inFolder:n.inFolder,parent:""}),n.childXmlNames&&(n.childXmlNames instanceof Array?n.childXmlNames:[n.childXmlNames]).forEach(k=>{g.push({name:k,inFolder:"false",parent:n.xmlName})})}),a.webview.postMessage({command:"loading",message:"Refreshing Components(0/"+g.length+")"}),Promise.all(g.map(n=>sendSoapMDRequest(t,s,"<met:listMetadata><met:queries><met:type>"+(n.inFolder==="true"?n.name==="EmailTemplate"?"EmailFolder":n.name+"Folder":n.name)+"</met:type></met:queries></met:listMetadata>").then(h=>{const k=h.listMetadataResponse;let b=buildComponents(k,n.parent);if(n.inFolder==="true"){let x=[];return Promise.all(b.map(y=>sendSoapMDRequest(t,s,"<met:listMetadata><met:queries><met:type>"+n.name+"</met:type><met:folder>"+y.name+"</met:folder></met:queries></met:listMetadata>").then(D=>{const M=D.listMetadataResponse;let E=buildComponents(M,n.parent);y.type=n.name,x=[...x,...E,y]}))).then(()=>{d.set(n.name,x),a.webview.postMessage({command:"loading",message:"Refreshing Components("+d.size+"/"+g.length+")"}),a.webview.postMessage({command:"components",components:x,type:n.name})}).catch(y=>{vscode.window.showErrorMessage(`Error ${y}`)})}else if(n.name==="CustomObject"){d.set(n.name,b),a.webview.postMessage({command:"components",components:b,type:n.name});const x=new Set(b.map(y=>y.name));return sendSoapAPIRequest(t,s,"<urn:describeGlobal/>").then(y=>{const D=y.describeGlobalResponse.result.sobjects;let M=[];D.forEach(l=>{l.custom==="false"&&l.layoutable==="true"&&x.has(l.name)&&M.push(l.name)});const E=[];for(let l=0;l<M.length;l+=100)E.push(M.slice(l,l+100));return Promise.all(E.map(l=>{var f="";return l.forEach(v=>{f+="<urn:sObjectType>"+v+"</urn:sObjectType>"}),sendSoapAPIRequest(t,s,"<urn:describeSObjects>"+f+"</urn:describeSObjects>").then(v=>{const m=v.describeSObjectsResponse.result,u=new Set(["Id","IsDeleted","CreatedById","CreatedDate","LastModifiedById","LastModifiedDate","LastReferencedDate","LastViewedDate","SystemModstamp","MasterRecordId","LastActivityDate"]);m.forEach(w=>{let I=[];w.fields.forEach(S=>{S.custom==="false"&&!u.has(S.name)&&(S.compoundFieldName===void 0||S.compoundFieldName==="Name")&&I.push(w.name+"."+S.name)}),c.set(w.name,I),a.webview.postMessage({command:"stdFields",name:w.name,fields:I})})}).catch(v=>{vscode.window.showErrorMessage(`Error ${v}`)})})).then(()=>{}).catch(l=>{vscode.window.showErrorMessage(`Error ${l}`)})}).catch(y=>{vscode.window.showErrorMessage(`Error ${y}`)})}else n.name==="StandardValueSet"&&(b=[],STD_VALUE_SET.forEach(x=>{b.push({name:x,type:"StandardValueSet",lastModifiedByName:"",lastModifiedDate:"",parent:""})})),d.set(n.name,b),a.webview.postMessage({command:"loading",message:"Refreshing Components("+d.size+"/"+g.length+")"}),a.webview.postMessage({command:"components",components:b,type:n.name})}).catch(h=>{vscode.window.showErrorMessage(`Error ${h}`)}))).then(()=>{o({components:d,sobjects:c})}).catch(n=>{vscode.window.showErrorMessage(`Error ${n}`)})}).catch(p=>{r(p)})})}function buildComponents(t,s){let e=[],a="1970-01-01T00:00:00.000Z";return t!==""&&(e=(t.result instanceof Array?t.result:[t.result]).map(r=>({name:r.fullName,type:r.type,parent:s,lastModifiedByName:r.lastModifiedByName,lastModifiedDate:r.lastModifiedDate!==a?new Date(r.lastModifiedDate).toLocaleDateString():r.createdDate!==a?new Date(r.createdDate).toLocaleDateString():""})),e=Array.from(new Map(e.map(r=>[r.type+r.name,r])).values())),e}function sendSoapMDRequest(t,s,e){const a=new xml2js.Parser({explicitArray:!1,ignoreAttrs:!0});let o='<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:met="http://soap.sforce.com/2006/04/metadata"><soapenv:Header><met:SessionHeader><met:sessionId>'+t+"</met:sessionId></met:SessionHeader></soapenv:Header><soapenv:Body>"+e+"</soapenv:Body></soapenv:Envelope>";return new Promise((r,d)=>{axios.post(s+"/services/Soap/m/62.0",o,{headers:{"Content-Type":"text/xml; charset=utf-8",SOAPAction:"Update"}}).then(c=>{a.parseString(c.data,(p,i)=>{if(p){vscode.window.showErrorMessage("Error parsing SOAP XML:",p);return}r(i["soapenv:Envelope"]["soapenv:Body"])})}).catch(c=>{a.parseString(c.response.data,(p,i)=>{d(i["soapenv:Envelope"]["soapenv:Body"]["soapenv:Fault"].faultstring)})})})}function sendSoapAPIRequest(t,s,e){const a=new xml2js.Parser({explicitArray:!1,ignoreAttrs:!0});let o='<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:urn="urn:partner.soap.sforce.com"><soapenv:Header><urn:SessionHeader><urn:sessionId>'+t+"</urn:sessionId></urn:SessionHeader></soapenv:Header><soapenv:Body>"+e+"</soapenv:Body></soapenv:Envelope>";return new Promise((r,d)=>{axios.post(s+"/services/Soap/u/62.0",o,{headers:{"Content-Type":"text/xml; charset=utf-8",SOAPAction:"Update"}}).then(c=>{a.parseString(c.data,(p,i)=>{if(p){vscode.window.showErrorMessage("Error parsing SOAP XML:",p);return}r(i["soapenv:Envelope"]["soapenv:Body"])})}).catch(c=>{a.parseString(c.response.data,(p,i)=>{d(i["soapenv:Envelope"]["soapenv:Body"]["soapenv:Fault"].faultstring)})})})}function getAuthOrgs(){return new Promise((t,s)=>{exec("sf org list --json",(e,a,o)=>{if(e)s(`Error: ${e}`);else try{const r=JSON.parse(a).result,d=[],c=[],p=[];c.push(...r.other,...r.sandboxes,...r.nonScratchOrgs,...r.devHubs,...r.scratchOrgs),c.forEach(i=>{i.connectedStatus==="Connected"&&p.indexOf(i.orgId)<0&&(d.push({name:i.alias+"("+i.username+")",alias:i.alias,orgId:i.orgId,accessToken:i.accessToken,instanceUrl:i.instanceUrl}),p.push(i.orgId))}),t(d)}catch(r){s(`Parse Error: ${r.message}`)}})})}function refreshOrgs(){return new Promise((t,s)=>{const e=path.join(process.env.HOME||process.env.USERPROFILE||"",".sfdx"),a=JSON.parse(fs.readFileSync(e+"/alias.json","utf-8"));console.log(a.orgs)})}function getWebviewContent(t,s,e){return`<!doctype html>
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
										<textarea class="errors" rows="9" style="line-height: 20px;scrollbar-width:thin;resize: none;width:100%;"></textarea>
									</div>									
									<button type="button" style="width:50px;float:right;padding: 5px;margin-right:-4px;" id="bulkselect">Select</button>
									<button type="button" style="width:70px;float:right;padding: 5px;margin-right:5px;display:none;" id="bulkcontinue">Continue</button>
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
