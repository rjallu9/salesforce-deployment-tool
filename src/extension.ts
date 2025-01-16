import * as vscode from 'vscode';
const path = require('path');
const axios = require('axios');
const xml2js = require('xml2js');
const { exec } = require('child_process');
const fs = require('fs');
const AdmZip = require('adm-zip');

let tmpDirectory = '';

export function activate(context: vscode.ExtensionContext) {
	const disposable = vscode.commands.registerCommand('salesforce-deployment-tool.build', () => {
			const panel = vscode.window.createWebviewPanel(
				'packageBuilder',
				'Salesforce Deployment Tool',
				vscode.ViewColumn.One,
				{ enableScripts: true, retainContextWhenHidden: true }
			);
			const scriptPath = vscode.Uri.file(
				path.join(context.extensionPath, 'out', 'assets/index.js')
			);
			const scriptUri = panel.webview.asWebviewUri(scriptPath);
			const cssPath = vscode.Uri.file(
				path.join(context.extensionPath, 'out', 'assets/index.css')
			);
			const cssUri = panel.webview.asWebviewUri(cssPath);

			panel.webview.html = getWebviewContent(context.extensionPath, scriptUri, cssUri);

			let orgsList: any[] = [];

			let isCancelDeploy = false;

			tmpDirectory = context.globalStorageUri.fsPath+"/tmp";

			panel.webview.onDidReceiveMessage((message) => {
				switch (message.command) {
					case 'getAuthOrgs':
						getAuthOrgs().then((result:any) => {
							orgsList = result;		
							panel.webview.postMessage({command: 'orgsList', orgs: result});				
						});						
						break;
					case 'loadTypes':
						var sourceOrg = orgsList.find((org:any) => org.orgId === message.sourceOrgId);	
						
						let selections:string[] = [];
						const selectionsPath = path.join(context.globalStorageUri.fsPath, 'selections.json');
						if (fs.existsSync(selectionsPath)) {
							selections = JSON.parse(fs.readFileSync(selectionsPath, 'utf-8'));
						}

						getTypes(sourceOrg.accessToken, sourceOrg.instanceUrl, context.globalStorageUri.fsPath)
                        .then((data) => {
                            panel.webview.postMessage({ command: 'types', types: data, selections:selections });
                        });
						break;
					case 'loadComponents':
						if(message.type) {
							var sourceOrg = orgsList.find((org:any) => org.orgId === message.sourceOrgId);
							getComponents(sourceOrg.accessToken, sourceOrg.instanceUrl, message.type, message.isFolder)
							.then((data) => {
								panel.webview.postMessage({ command: 'components', components: data, type: message.type });
							}).catch((error) => {
								panel.webview.postMessage({ command: 'components', components: [], type: message.type });
							});;
						}
						break;
					case 'updateFavorites':
						if(message.data) {
							const dir = path.dirname(context.globalStorageUri.fsPath+"/favorites.json");
							if (!fs.existsSync(dir)) {
								fs.mkdirSync(dir, { recursive: true });
							}
							fs.writeFileSync(context.globalStorageUri.fsPath+"/favorites.json", JSON.stringify(message.data, null, 2), 'utf8', (err:any) => {
								if (err) {
									vscode.window.showErrorMessage(`Unable to update favorites..!!`);
								}
							});
						}
						break;	
					case 'updateSelections':
						if(message.data) {
							const dir = path.dirname(context.globalStorageUri.fsPath+"/selections.json");
							if (!fs.existsSync(dir)) {
								fs.mkdirSync(dir, { recursive: true });
							}

							fs.writeFile(context.globalStorageUri.fsPath+"/selections.json", JSON.stringify(message.data, null, 2), 'utf8', (err:any) => {
								if (err) {
									vscode.window.showErrorMessage(`Unable to update selections..!!`);
								}
							});
						}
						break;					
					case 'deploy':
						panel.webview.postMessage({ command: 'deployStatus', result: {stage:"retrieve", message: 'Retrieve components Initiated'}});
						var sourceOrg = orgsList.find((org:any) => org.orgId === message.sourceOrgId);		
						var destOrg = orgsList.find((org:any) => org.orgId === message.destOrgId);													
						retrieve(sourceOrg.accessToken, sourceOrg.instanceUrl, message.packagexml).then((result:any) => {	
							panel.webview.postMessage({ command: 'deployStatus', result: {stage:"retrieve", message: 'Retrieve components Inprogress'}});	
							let retrieveJobId = result;
							let intervalId = setInterval(() => {
								retrieveStatus(sourceOrg.accessToken, sourceOrg.instanceUrl, retrieveJobId).then((result:any) => {	
									if(result.done	=== 'true') {
										panel.webview.postMessage({ command: 'deployStatus', result: {stage:"retrieveCompleted", message: 'Retrieve components Completed'}});
										clearInterval(intervalId);
										if(!isCancelDeploy) {
											panel.webview.postMessage({ command: 'deployStatus', result: {stage:"deployment", 
												message: message.checkOnly ? 'Validation Initiated' : 'Deployment Initiated'}});
											deploy(destOrg.accessToken, destOrg.instanceUrl, result.zipFile, message.checkOnly, 
													message.testLevel, message.testClasses).then((result:any) => {
												let deployJobId = result;
												let deployIntervalId = setInterval(() => {
													if(isCancelDeploy) {
														cancelDeploy(destOrg.accessToken, destOrg.instanceUrl, deployJobId);
														isCancelDeploy = false;
													}
													deployStatus(destOrg.accessToken, destOrg.instanceUrl, deployJobId).then((result:any) => {	
														if(result.done	=== 'true') {
															clearInterval(deployIntervalId);	
														}	
														result['stage']	= "deploymentStatus";	
														panel.webview.postMessage({ command: 'deployStatus', result: result});	
													}).catch((error) => {
														clearInterval(deployIntervalId);	
													});
												}, 2000);	
											});
										} else {
											panel.webview.postMessage({ command: 'deployStatus', result: {stage:"deployment", 
												message: message.checkOnly ? 'Validation Cancelled' : 'Deployment Cancelled'}});
										}
									}		
								}).catch((error) => {
									clearInterval(intervalId);	
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
									clearInterval(intervalId);	
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
					case 'compare':
						let sourceOrgFiles = new Map();
						let destOrgFiles = new Map();
						var sourceOrg = orgsList.find((org:any) => org.orgId === message.sourceOrgId);	
						var destOrg = orgsList.find((org:any) => org.orgId === message.destOrgId);
						var time = Date.now();	
						let sourceProcess=false, destProcess = false;

						retrieve(sourceOrg.accessToken, sourceOrg.instanceUrl, message.packagexml).then((result:any) => {	
							let retrieveJobId = result;
							let intervalId = setInterval(() => {
								retrieveStatus(sourceOrg.accessToken, sourceOrg.instanceUrl, retrieveJobId).then((result:any) => {	
									if(result.done	=== 'true') {
										clearInterval(intervalId);	
										sourceOrgFiles = result.fileNames;
										extractComponents(result.zipFile, tmpDirectory+'/'+time, sourceOrg.alias);
										sourceProcess = true;
									}		
								}).catch((error) => {
									vscode.window.showErrorMessage(`Error: ${JSON.stringify(error)}`);
									clearInterval(intervalId);	
								});
							}, 1000);			
						});

						retrieve(destOrg.accessToken, destOrg.instanceUrl, message.packagexml).then((result:any) => {	
							let destRetrieveJobId = result;
							let destIntervalId = setInterval(() => {
								retrieveStatus(destOrg.accessToken, destOrg.instanceUrl, destRetrieveJobId).then((result:any) => {		
									if(result.done	=== 'true') {
										clearInterval(destIntervalId);	
										destOrgFiles = result.fileNames;
										extractComponents(result.zipFile, tmpDirectory+'/'+time, destOrg.alias);
										destProcess = true;
									}		
								}).catch((error) => {
									vscode.window.showErrorMessage(`Error: ${JSON.stringify(error)}`);
									clearInterval(destIntervalId);	
								});
							}, 1000);			
						});

						let responseIntervalId = setInterval(() => {
							if(sourceProcess && destProcess) {
								postCompareResults(sourceOrgFiles, destOrgFiles, tmpDirectory+"/"+time+"/"+sourceOrg.alias, 
									tmpDirectory+"/"+time+"/"+destOrg.alias, panel);
								clearInterval(responseIntervalId);	
							}
						}, 1000);	
						break;
					case 'filePreview':
						let title = message.file+': Source ↔ Target';
						vscode.commands.executeCommand('vscode.diff',  vscode.Uri.file(message.source),  
								vscode.Uri.file(message.dest), title, { preview: false });
						break;
					default:
					console.log('Unknown command:', message.command);
				}
			});

			panel.onDidDispose(() => {
				if (tmpDirectory && fs.existsSync(tmpDirectory)) {
					try {
						fs.rmSync(tmpDirectory, { recursive: true, force: true });
					} catch (err) {
					}
				}
			});
		
	});

	context.subscriptions.push(disposable);
}

function postCompareResults(sourceOrgFiles:Map<string, string>, destOrgFiles:Map<string, string>, sourceOrgPath:string, destOrgPath:string, panel:vscode.WebviewPanel) {
	let files: { name: string; source: string; dest: string }[] = [];
	sourceOrgFiles.forEach((value, key) => {
		let tmp = { name: key, source: sourceOrgPath+"/"+value, dest:"" };
		if(destOrgFiles.has(key)) {
			tmp.dest = destOrgPath+"/"+destOrgFiles.get(key);
		}
		files.push(tmp);
	});
	panel.webview.postMessage({ command: 'compareResults', files: files});    
}

function extractComponents(zipfile:string, directory:string, alias:string) {
	const buffer = Buffer.from(zipfile, 'base64');
	if (!fs.existsSync(directory+"/"+alias)) {
		fs.mkdirSync(directory+"/"+alias, { recursive: true });
	}
	const zipFilePath = path.join(directory, alias+'.zip');
	fs.writeFileSync(zipFilePath, buffer);	

	const zip = new AdmZip(zipFilePath);
	zip.extractAllTo(directory+"/"+alias, true);
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
			let fileNames = new Map();
			if(res['done'] === 'true') {
				let tmp = res['fileProperties'] instanceof Array ? res['fileProperties'] : [res['fileProperties']];
				tmp.forEach((file: any) => {
					fileNames.set(file.type+"."+file.fullName, file.fileName);
				});	
			}
			resolve({
				done: res['done'],
				zipFile: res['zipFile'],
				fileNames: fileNames
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

function getComponents(accessToken:string, endPoint:string, type:string, isFolder:boolean) {
    return new Promise((resolve, reject) => {
		sendSoapReuest(accessToken, endPoint, '<met:listMetadata><met:queries><met:type>'+type+(isFolder ? 'Folder' : '')+'</met:type></met:queries></met:listMetadata>')
		.then((result:any) => {
			const comps = result['soapenv:Envelope']['soapenv:Body']['listMetadataResponse'];
			let results = buildComponents(comps);	
			if(isFolder) {
				let folderresults:Object[] = [];	
				const promises = results.map((element:any) => {
					return sendSoapReuest(accessToken, endPoint, '<met:listMetadata><met:queries><met:type>'+type+
						'</met:type><met:folder>'+element.name+'</met:folder></met:queries></met:listMetadata>')
					.then((result:any) => {
						const comps = result['soapenv:Envelope']['soapenv:Body']['listMetadataResponse'];
						let fldresults = buildComponents(comps);	
						folderresults = [...folderresults, ...fldresults];
					});
				});
				Promise.all(promises)
				.then(() => {
					resolve(folderresults);
				});
			} else {
				if(type === 'CustomMetadata') {
					const names = new Set();
					results.forEach((e:{ name: string; id: string; type: string, lastModifiedByName: string; lastModifiedDate: string; manageableState: string }) => {
						names.add(e.name.split('.')[0]+'__mdt');
					});
					let records = new Map();
					const promises = Array.from(names).map(e => {
						return getMetdata(accessToken, endPoint, ''+e).then((result:any) => {
							let tmp = result instanceof Array ? result : [result];
							tmp.forEach(r => {
								records.set(r['sf:Id'] instanceof Array ? r['sf:Id'][0] : r['sf:Id'], r['sf:SystemModstamp']);
							});							
						});
					});
					Promise.all(promises)
					.then(() => {
						results.forEach((e:{ name: string; id: string; type: string, lastModifiedByName: string; lastModifiedDate: string; manageableState: string }) => {
							e.lastModifiedDate = new Date(records.get(e.id)).toLocaleDateString();
						});
						resolve(results);
					});
				} else {
					resolve(results);
				}					
			}			
        })
        .catch((error:any) => {
            reject(error);			
        });
    });
}

function buildComponents(comps:any) {
	let results: { name: string; id: string; type: string, lastModifiedByName: string; lastModifiedDate: string; manageableState: string }[] = [];
	let auditDate = '1970-01-01T00:00:00.000Z';
	if(comps !== "") {
		let tmp = comps['result'] instanceof Array ? comps['result'] : [comps['result']];
		results = tmp.map((comp: any) => ({
			name: comp['fullName'],
			id: comp['id'],
			type: comp['type'],
			lastModifiedByName: comp['lastModifiedByName'],
			lastModifiedDate: comp['lastModifiedDate'] !== auditDate ? new Date(comp['lastModifiedDate']).toLocaleDateString() : 
						comp['createdDate'] !== auditDate ? new Date(comp['createdDate']).toLocaleDateString() : '',
			manageableState: comp['manageableState'] === undefined ? 'unmanaged' : comp['manageableState']
		}));	
		results = results.filter(cmp => cmp.id !== '');		
	}
	return results;
}

function getTypes(accessToken:string, endPoint:string, globalStorageUri:string) {
	let favorites:string[] = [];
	const favoritesPath = path.join(globalStorageUri, 'favorites.json');
	if (fs.existsSync(favoritesPath)) {
		favorites = JSON.parse(fs.readFileSync(favoritesPath, 'utf-8'));
	}

    return new Promise((resolve, reject) => {
		sendSoapReuest(accessToken, endPoint, '<met:describeMetadata><met:asOfVersion>62.0</met:asOfVersion></met:describeMetadata>')
		.then((result:any) => {
			const types = result['soapenv:Envelope']['soapenv:Body']['describeMetadataResponse']['result']['metadataObjects'];			
			const typesList:Object[] = [];
			types.forEach((element:any) => {
				typesList.push({
					name: element['xmlName'],
					isFavorite: favorites.indexOf(element['xmlName']) >= 0,
					hidden: false,
					inFolder: element['inFolder']
				});
				if(element['childXmlNames']) {
					let tmp = element['childXmlNames'] instanceof Array ? element['childXmlNames'] : [element['childXmlNames']];
					tmp.forEach((childname:any) => {
						typesList.push({
							name: childname,
							isFavorite: favorites.indexOf(element['xmlName']) >= 0,
							hidden: false,
							inFolder: 'false'
						});
					});	
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
				/*vscode.window.showWarningMessage('Unable to connect to the Org. Message: '+
					result['soapenv:Envelope']['soapenv:Body']['soapenv:Fault']['faultstring']);*/
				reject(result['soapenv:Envelope']['soapenv:Body']['soapenv:Fault']['faultstring']);
			});		
		});
	});
}

function getMetdata(accessToken:string,  endPoint:string, name:string) {
	const parser = new xml2js.Parser({ explicitArray: false, ignoreAttrs: true });	
	let reuest =  '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:urn="urn:partner.soap.sforce.com">'+
		'<soapenv:Header><urn:SessionHeader><urn:sessionId>'+accessToken+'</urn:sessionId></urn:SessionHeader></soapenv:Header>'+
		'<soapenv:Body><urn:query><urn:queryString>SELECT Id, SystemModstamp FROM '+name+'</urn:queryString></urn:query></soapenv:Body></soapenv:Envelope>';
	
	return new Promise((resolve, reject) => {
		axios.post(endPoint+"/services/Soap/u/62.0", reuest, { headers: {
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
				const records = result['soapenv:Envelope']['soapenv:Body']['queryResponse']['result']['records'];
				resolve(records instanceof Array ? records : [records]);
			});
		})
		.catch((error:any) => {	
		});
	});
}

function getAuthOrgs() {
    return new Promise((resolve, reject) => {
        exec('sf org list --json', (error:any, stdout:any, stderr:any) => {
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
								alias: org['alias'],
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
        });
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
										<span style="margin-left:-20px;pointer-events: none;color: #888;">▼</span>
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
			<script src=${scriptUri}></script>
			<link rel="stylesheet" href=${cssUri}>
			</html>`;
}

export function deactivate() {
	if (tmpDirectory && fs.existsSync(tmpDirectory)) {
        try {
            fs.rmSync(tmpDirectory, { recursive: true, force: true });
        } catch (err) {
        }
    }
}

