import * as vscode from 'vscode';
const path = require('path');
const axios = require('axios');
const xml2js = require('xml2js');
const { exec } = require('child_process');
import favorites from './assets/favorites.json';
const fs = require('fs');

export function activate(context: vscode.ExtensionContext) {
	const disposable = vscode.commands.registerCommand('salesforce-deployment-tool.build', () => {
			const panel = vscode.window.createWebviewPanel(
				'packageBuilder',
				'Salesforce Deployment Tool',
				vscode.ViewColumn.One,
				{ enableScripts: true }
			);
			const scriptPath = vscode.Uri.file(
				path.join(context.extensionPath, 'out', 'assets/index.js')
			);
			const scriptUri = panel.webview.asWebviewUri(scriptPath);
			const cssPath = vscode.Uri.file(
				path.join(context.extensionPath, 'out', 'assets/index.css')
			);
			const cssUri = panel.webview.asWebviewUri(cssPath);

			const favJson = path.join(context.extensionPath, 'out', 'assets/favorites.json');

			panel.webview.html = getWebviewContent(context.extensionPath, scriptUri, cssUri);

			let orgsList: any[] = [];

			let isCancelDeploy = false;

			panel.webview.onDidReceiveMessage((message) => {
				switch (message.command) {
					case 'getAuthOrgs':
						vscode.window.withProgress({
							location: vscode.ProgressLocation.Notification,
							cancellable: false
						}, async (progress) => {
							return new Promise((async (resolve) => {	
								let token = new vscode.CancellationTokenSource();
								token.token.onCancellationRequested(() => {
									token?.dispose();
									resolve(null);
									return;
								});
								let countr = 90;
								for(let i=1; i<countr; i++) {
									progress.report({ increment:1, message: `Loading Authorized Orgs...` });
									await new Promise((resolve) => {setTimeout(resolve, 1000);});
									getAuthOrgs().then((result:any) => {
										countr = 0;	
										token.cancel();
										orgsList = result;		
										panel.webview.postMessage({command: 'orgsList', orgs: result});				
									});
								}
							}));
						});
						
						break;
					case 'loadTypes':
						var sourceOrg = orgsList.find((org:any) => org.orgId === message.sourceOrgId);		
						getTypes(sourceOrg.accessToken, sourceOrg.instanceUrl, favorites)
                        .then((data) => {
                            panel.webview.postMessage({ command: 'types', types: data });
                        });
						break;
					case 'loadComponents':
						if(message.type) {
							var sourceOrg = orgsList.find((org:any) => org.orgId === message.sourceOrgId);
							//vscode.window.showInformationMessage(`Loading: ${message.type}`);	
							getComponents(sourceOrg.accessToken, sourceOrg.instanceUrl, message.type)
							.then((data) => {
								panel.webview.postMessage({ command: 'components', components: data, type: message.type });
							});
						}
						break;
					case 'updateFavorites':
						if(message.data) {
							fs.writeFile(favJson, JSON.stringify(message.data, null, 2), 'utf8', (err:any) => {
								if (err) {
									vscode.window.showErrorMessage(`Unable to update favorites..!!`);
								}
							});
						}
						break;					
					case 'deploy':
						panel.webview.postMessage({ command: 'deployStatus', result: {stage:"retrieve", message: 'Retrieve components Initiated'}});
						var sourceOrg = orgsList.find((org:any) => org.orgId === message.sourceOrgId);		
						var destOrg = orgsList.find((org:any) => org.orgId === message.destOrgId);													
						retrieve(sourceOrg.accessToken, sourceOrg.instanceUrl, message.packagexml).then((result:any) => {	
							panel.webview.postMessage({ command: 'deployStatus', result: {stage:"retrieveStatus", message: 'Retrieve components Inprogress'}});	
							let retrieveJobId = result;
							let intervalId = setInterval(() => {
								retrieveStatus(sourceOrg.accessToken, sourceOrg.instanceUrl, retrieveJobId).then((result:any) => {	
									if(result.done	=== 'true') {
										panel.webview.postMessage({ command: 'deployStatus', result: {stage:"retrieveStatus", message: 'Retrieve components Completed'}});
										clearInterval(intervalId);
										if(!isCancelDeploy) {
											panel.webview.postMessage({ command: 'deployStatus', result: {stage:"deployment", 
												message: message.checkOnly ? 'Validation Initiated' : 'Deployment Initiated'}});
											deploy(destOrg.accessToken, destOrg.instanceUrl, result.zipFile, message.checkOnly, 
													message.testLevel, message.testClasses).then((result:any) => {
												let deployJobId = result;
												intervalId = setInterval(() => {
													if(isCancelDeploy) {
														cancelDeploy(destOrg.accessToken, destOrg.instanceUrl, deployJobId);
														isCancelDeploy = false;
													}
													deployStatus(destOrg.accessToken, destOrg.instanceUrl, deployJobId).then((result:any) => {	
														if(result.done	=== 'true') {
															clearInterval(intervalId);	
														}	
														result['stage']	= "deploymentStatus";	
														panel.webview.postMessage({ command: 'deployStatus', result: result});	
													});
												}, 2000);	
											});
										} else {
											panel.webview.postMessage({ command: 'deployStatus', result: {stage:"deployment", 
												message: message.checkOnly ? 'Validation Cancelled' : 'Deployment Cancelled'}});
										}
									}		
								}).catch((error) => {
								});
							}, 1000);			
						});
						break;
					case 'quickDeploy':
						var destOrg = orgsList.find((org:any) => org.orgId === message.destOrgId);		
						panel.webview.postMessage({ command: 'deployStatus', result: {stage:"deployment", message: 'Deployment Initiated'}});
						quickDeploy(destOrg.accessToken, destOrg.instanceUrl, message.id).then((result:any) => {
							let deployJobId = result;
							let intervalId = setInterval(() => {
								deployStatus(destOrg.accessToken, destOrg.instanceUrl, deployJobId).then((result:any) => {	
									if(result.done	=== 'true') {
										clearInterval(intervalId);	
									}	
									result['stage']	= "deploymentStatus";	
									panel.webview.postMessage({ command: 'deployStatus', result: result});	
								}).catch((error) => {
								});
							}, 2000);	
						});
						break;
					case 'cancelDeploy':
						isCancelDeploy = true;
						break;
					case 'toastMessage':
						vscode.window.showInformationMessage(`${message.message}`);	
						break;
					default:
						console.log('Unknown command:', message.command);
				}
			});
		
	});

	context.subscriptions.push(disposable);
}

function cancelDeploy(accessToken:string, endPoint:string, deployJobId:string) {
    return new Promise((resolve, reject) => {
		sendSoapReuest(accessToken, endPoint, '<met:cancelDeploy><met:String>'+deployJobId+'</met:String></met:cancelDeploy>')
		.then((result:any) => {
			const res = result['soapenv:Envelope']['soapenv:Body']['cancelDeployResponse']['result'];	
			resolve(res);	
        })
        .catch((error:any) => {
			vscode.window.showErrorMessage(`Error: ${JSON.stringify(error)}`);
            reject(error);			
        });
    });
}

function quickDeploy(accessToken:string, endPoint:string, deployJobId:string) {
    return new Promise((resolve, reject) => {
		sendSoapReuest(accessToken, endPoint, '<met:deployRecentValidation><met:validationId>'+deployJobId+
			'</met:validationId></met:deployRecentValidation>')
		.then((result:any) => {
			const res = result['soapenv:Envelope']['soapenv:Body']['deployRecentValidationResponse']['result'];	
			resolve(res);
        })
        .catch((error:any) => {
            reject(error);			
        });
    });
}

function deployStatus(accessToken:string, endPoint:string, deployJobId:string) {
    return new Promise((resolve, reject) => {
		sendSoapReuest(accessToken, endPoint, '<met:checkDeployStatus><met:asyncProcessId>'+deployJobId+
			'</met:asyncProcessId><met:includeDetails>true</met:includeDetails></met:checkDeployStatus>')
		.then((result:any) => {
			const res = result['soapenv:Envelope']['soapenv:Body']['checkDeployStatusResponse']['result'];	
			resolve(res);
        })
        .catch((error:any) => {
            reject(error);			
        });
    });
}

function deploy(accessToken:string, endPoint:string, zipfile:string, checkOnly:boolean, testLevel:string, testClasses:string) {
    return new Promise((resolve, reject) => {
		sendSoapReuest(accessToken, endPoint, '<met:deploy><met:ZipFile>'+zipfile+'</met:ZipFile><met:DeployOptions>'+
			'<met:checkOnly>'+checkOnly+'</met:checkOnly><met:testLevel>'+testLevel+'</met:testLevel>'+testClasses+
			'<met:singlePackage>true</met:singlePackage></met:DeployOptions></met:deploy>')
		.then((result:any) => {
			const retrieveId = result['soapenv:Envelope']['soapenv:Body']['deployResponse']['result']['id'];	
			resolve(retrieveId);	
        })
        .catch((error:any) => {
            reject(error);			
        });
    });
}

function retrieveStatus(accessToken:string, endPoint:string, retrieveJobId:string) {
    return new Promise((resolve, reject) => {
		sendSoapReuest(accessToken, endPoint, '<met:checkRetrieveStatus><met:asyncProcessId>'+retrieveJobId+
			'</met:asyncProcessId><met:includeZip>true</met:includeZip></met:checkRetrieveStatus>')
		.then((result:any) => {
			const res = result['soapenv:Envelope']['soapenv:Body']['checkRetrieveStatusResponse']['result'];	
			resolve({
				done: res['done'],
				zipFile: res['zipFile']
			});	
        })
        .catch((error:any) => {
            reject(error);			
        });
    });
}

function retrieve(accessToken:string, endPoint:string, packagexml:string) {
    return new Promise((resolve, reject) => {
		sendSoapReuest(accessToken, endPoint, '<met:retrieve><met:retrieveRequest><met:apiVersion>62.0</met:apiVersion>'+
			'<met:singlePackage>true</met:singlePackage><met:unpackaged>'+packagexml+'</met:unpackaged></met:retrieveRequest></met:retrieve>')
		.then((result:any) => {
			const retrieveId = result['soapenv:Envelope']['soapenv:Body']['retrieveResponse']['result']['id'];	
			resolve(retrieveId);
        })
        .catch((error:any) => {
            reject(error);			
        });
    });
}

function getComponents(accessToken:string, endPoint:string, type:string) {
    return new Promise((resolve, reject) => {
		sendSoapReuest(accessToken, endPoint, '<met:listMetadata><met:queries><met:type>'+type+'</met:type></met:queries></met:listMetadata>')
		.then((result:any) => {
			const comps = result['soapenv:Envelope']['soapenv:Body']['listMetadataResponse'];	
			if(comps !== "") {
				if(comps['result'] instanceof Array) {
					const compsList = comps['result'].map((comp: any) => ({
						name: comp['fullName'],
						type: comp['type'],
						lastModifiedByName: comp['lastModifiedByName'],
						lastModifiedDate: new Date(comp['lastModifiedDate']).toLocaleDateString(),
						manageableState: comp['manageableState']
					}));			
					resolve(compsList);
				} else {	
					resolve([{
						name: comps['result']['fullName'],
						type: comps['result']['type'],
						lastModifiedByName: comps['result']['lastModifiedByName'],
						lastModifiedDate: new Date(comps['lastModifiedDate']).toLocaleDateString(),
						manageableState: comps['manageableState']
					}]);
				}
			} else {
				resolve([]);
			}	
        })
        .catch((error:any) => {
            reject(error);			
        });
    });
}

function getTypes(accessToken:string, endPoint:string, favorites:string[]) {
    return new Promise((resolve, reject) => {
		sendSoapReuest(accessToken, endPoint, '<met:describeMetadata><met:asOfVersion>62.0</met:asOfVersion></met:describeMetadata>')
		.then((result:any) => {
			const types = result['soapenv:Envelope']['soapenv:Body']['describeMetadataResponse']['result']['metadataObjects'];			
			const typesList:Object[] = [];
			types.forEach((element:any) => {
				typesList.push({
					name: element['xmlName'],
					isFavorite: favorites.indexOf(element['xmlName']) >= 0,
					hidden: false
				});
				if(element['childXmlNames']) {
					if(element['childXmlNames'] instanceof Array) {
						element['childXmlNames'].forEach((childname:any) => {
							typesList.push({
								name: childname,
								isFavorite: favorites.indexOf(element['xmlName']) >= 0,
								hidden: false
							});
						});			
					} else {	
						typesList.push({
							name: element['childXmlNames'],
							isFavorite: favorites.indexOf(element['xmlName']) >= 0,
							hidden: false
						});
					}
				}
			});			
			resolve(typesList);
        })
        .catch((error:any) => {
            reject(error);			
        });
    });
}

function sendSoapReuest(accessToken:string,  endPoint:string, body:string) {
	const parser = new xml2js.Parser({ explicitArray: false, ignoreAttrs: true });	
	let reuest =  '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:met="http://soap.sforce.com/2006/04/metadata">'+
		'<soapenv:Header><met:SessionHeader><met:sessionId>'+accessToken+'</met:sessionId></met:SessionHeader></soapenv:Header>'+
		'<soapenv:Body>'+body+'</soapenv:Body></soapenv:Envelope>';
	
	return new Promise((resolve, reject) => {
		axios.post(endPoint+"/services/Soap/m/62.0", reuest, { headers: {
					'Content-Type': 'text/xml; charset=utf-8',
					'SOAPAction': 'Update',
				},
			}
		).then((response:any) => {
			parser.parseString(response.data, (err:any, result:any) => {
				if (err) {
					vscode.window.showErrorMessage("Error parsing SOAP XML:", err);
					return;
				}		
				resolve(result);
			});
		})
		.catch((error:any) => {
			parser.parseString(error.response.data, (err:any, result:any) => {	
				vscode.window.showWarningMessage('Unable to connect to the Org. Message: '+
					result['soapenv:Envelope']['soapenv:Body']['soapenv:Fault']['faultstring']);
				reject(result['soapenv:Envelope']['soapenv:Body']['soapenv:Fault']['faultstring']);
			});		
		});
	});
}

function getAuthOrgs() {
    return new Promise((resolve, reject) => {
        /*exec('sf org list --json', (error:any, stdout:any, stderr:any) => {
            if (error) {
                reject(`Error: ${error}`);
            } else {
                try {
                    const data = JSON.parse(stdout).result;					
					const orgList:Object[] = [];
					const orgs = [];
					const orgIds:string[] = [];
					orgs.push(...data.other, ...data.sandboxes, ...data.nonScratchOrgs, ...data.devHubs, ...data.scratchOrgs);
					orgs.forEach((org:any) => {
						if(org.connectedStatus === 'Connected' && orgIds.indexOf(org['orgId']) < 0) {
							orgList.push({
								name: org['alias']+'('+org['username']+')',
								orgId: org['orgId'],
								accessToken: org['accessToken'],
								instanceUrl: org['instanceUrl']
							});
							orgIds.push(org['orgId']);
						}						
					});
                    resolve(orgList);
                } catch (parseError:any) {
                    reject(`Parse Error: ${parseError.message}`);
                }
            }
        });*/
		resolve([{"name": "SiriApp(ramu.jallu@yahoo.in)", "orgId": "00D6g00000360OaEAI","instanceUrl": "https://siriapp-dev-ed.my.salesforce.com",
			"accessToken": "00D6g00000360Oa!AQcAQL6XtB3m9I9K8h4G9.jKix2ILTp31lAQxusejh5Z97Rf6Q8CmKr4Y2E65HAeCX_BQRG5rBrYzH9aKZX68.ITCqq4l.nt"},
			{"name": "ICE(ramu.jallu@gmail.com)", "orgId": "00D3t000004pIgVEAU","instanceUrl": "https://ice7-dev-ed.my.salesforce.com",
				"accessToken": "00D3t000004pIgV!AQgAQN2Rop2gVzrvqsKCH_.O5jinKNkn5CtJApXLXLWLhyxe6m.MjUDKwem1UmTEHJA34h6mbxPo0JW0BX07rUy_EB2FO7wa"},
			{"name": "AgentForce(epic.321e1730601128842@orgfarm.th)", "orgId": "00D6P000000kU2zUAE","instanceUrl": "https://d6p000000ku2zuae-dev-ed.develop.my.salesforce.com",
				"accessToken": "00D6P000000kU2z!AQ4AQLxrh..1SoO2EBAoNX0hENqctA5D1BgXb6VS4_MS22WQRQ2eUH1HDgsbH0Bipe8cLIXyobtiv8geE_xG6.iAsUhE3ODv"}]);
    });
}

function getWebviewContent(basedpath:string, scriptUri:vscode.Uri, cssUri:vscode.Uri) {

	return `<!doctype html>
			<html lang="en">
			<head>
				<meta charset="UTF-8" />
				<meta name="viewport" content="width=device-width, initial-scale=1.0" />
				<title>Salesforce Deployment Tool</title>
				<script src="https://code.jquery.com/jquery-3.7.1.min.js"></script>
				<script src="https://code.jquery.com/ui/1.14.1/jquery-ui.min.js"></script>
				<script src="https://cdn.datatables.net/2.1.8/js/dataTables.min.js"></script>				
				<link rel="stylesheet" href="https://cdn.datatables.net/2.1.8/css/dataTables.dataTables.min.css">
				<script src="https://cdn.datatables.net/select/2.1.0/js/dataTables.select.min.js"></script>				
				<link rel="stylesheet" href="https://cdn.datatables.net/select/2.1.0/css/select.dataTables.min.css">
				<link rel="stylesheet" href="https://code.jquery.com/ui/1.14.1/themes/base/jquery-ui.css">
			</head>
			<body>	
				<div style="margin: 20px;">
					<h1>Salesforce Deployment Tool</h1>
					
					<div id="source-org" style="float:left;margin-right:5px">	
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
										<span style="margin-left:-20px;pointer-events: none;color: #888;">▼</span>
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
								<button type="button" style="padding: 7px; width: 75px;float:right;margin-top:22px;margin-left: 5px;" id="deploy">Deploy</button>
								<button type="button" style="padding: 7px; width: 75px;float:right;margin-top:22px;margin-left: 5px;" id="validate">Validate</button>	
								<div style="float:right;">
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
							<p>Deployment Status: &nbsp;&nbsp; 
								<a href="#" id="quick-deploy" style="display:none">Quick Deploy</a>
								<a href="#" id="cancel-deploy">Cancel Deployment</a>
							</p>
							<div id="progressbar"><div class="progress-label"></div></div>
							<div class="coverage-error"><p class="coverage-error-label"></p></div>
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
			</body>
			<script src=${scriptUri}></script>
			<link rel="stylesheet" href=${cssUri}>
			</html>`;
  }

