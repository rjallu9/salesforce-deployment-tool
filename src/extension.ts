import * as vscode from 'vscode';
import stdValueSet from './assets/stdValueSet.json';
const path = require('path');
const axios = require('axios');
const xml2js = require('xml2js');
const { exec } = require('child_process');
const fs = require('fs');
const AdmZip = require('adm-zip');

let tmpDirectory = '';
let STD_VALUE_SET = stdValueSet;

export function activate(context: vscode.ExtensionContext) {
	const disposable = vscode.commands.registerCommand('salesforce-deployment-suite.build', () => {
			const panel = vscode.window.createWebviewPanel(
				'packageBuilder',
				'Salesforce Deployment Suite',
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
						var orgsListPath = path.join(context.globalStorageUri.fsPath, 'orgsList.json');
						if (fs.existsSync(orgsListPath) && !message.refresh) {
							orgsList = JSON.parse(fs.readFileSync(orgsListPath, 'utf-8'));
							panel.webview.postMessage({ command: 'orgsList', orgs: orgsList});
						} else {
							getAuthOrgs().then((result:any) => {
								orgsList = result;	
								panel.webview.postMessage({command: 'orgsList', orgs: result});	
								const dir = path.dirname(context.globalStorageUri.fsPath);
								if (!fs.existsSync(dir)) {
									fs.mkdirSync(dir, { recursive: true });
								}	
								fs.writeFile(context.globalStorageUri.fsPath+"/orgsList.json", JSON.stringify(orgsList, null, 2), 'utf8', (err:any) => {
								}); 			
							});	
						}				
						break;
					case 'loadTypesComponents':
						var sourceOrg = orgsList.find((org:any) => org.orgId === message.sourceOrgId);	
						validateSession(sourceOrg.accessToken, sourceOrg.instanceUrl, message.sourceOrgId)
						.then((result:any) => {
							if(result.valid) {
								if(result.orgsList) {
									orgsList = result.orgsList;
									sourceOrg = orgsList.find((org:any) => org.orgId === message.sourceOrgId);	
									fs.writeFile(context.globalStorageUri.fsPath+"/orgsList.json", JSON.stringify(orgsList, null, 2), 'utf8', (err:any) => {}); 
								}
								var snapshots:string[] = [];
								var snapshotPath = path.join(context.globalStorageUri.fsPath+"/"+sourceOrg.orgId, 'snapshots.json');
								if (fs.existsSync(snapshotPath)) {
									snapshots = JSON.parse(fs.readFileSync(snapshotPath, 'utf-8'));
								}

								var metdataPath = path.join(context.globalStorageUri.fsPath+"/"+sourceOrg.orgId, 'metadata.json');
								if (fs.existsSync(metdataPath) && !message.refresh) {
									const metadata = new Map(JSON.parse(fs.readFileSync(metdataPath, 'utf-8')));
									const timestamp = metadata.get('Timestamp');
									metadata.delete('Timestamp');
									for (const [key, value] of metadata) {
										panel.webview.postMessage({ command: 'components', components:value, type:key });								
									}
									panel.webview.postMessage({ command: 'typesComponents', components: '', snapshots:snapshots, timestamp });
								} else {
									const now = new Date();
									getTypesComponents(sourceOrg.accessToken, sourceOrg.instanceUrl, context.globalStorageUri.fsPath, panel)
									.then((data:any) => {
										panel.webview.postMessage({ command: 'typesComponents', components: data, snapshots:snapshots, 
											timestamp: `${now.toLocaleDateString()} ${now.toLocaleTimeString()}`});
										saveMetadata(data.components, data.sobjects, context.globalStorageUri.fsPath, sourceOrg.orgId);								
									});
								}	
							}
						}).catch((error) => {
							panel.webview.postMessage({ command: 'error', message:'Unable to connect to the Org.' });
						});				
						break;
					case 'updateSnapshot':
						if(message.data) {
							const dir = path.dirname(context.globalStorageUri.fsPath+"/"+message.orgId+"/snapshots.json");
							if (!fs.existsSync(dir)) {
								fs.mkdirSync(dir, { recursive: true });
							}

							fs.writeFile(context.globalStorageUri.fsPath+"/"+message.orgId+"/snapshots.json", JSON.stringify(message.data, null, 2), 'utf8', (err:any) => {
								if (err) {
									vscode.window.showErrorMessage(`Unable to update snapshots..!!`);
								}
							});
						}
						break;					
					case 'deploy':
						panel.webview.postMessage({ command: 'deployStatus', result: {stage:"retrieve", message: 'Retrieve components Initiated'}});
						var sourceOrg = orgsList.find((org:any) => org.orgId === message.sourceOrgId);		
						var destOrg = orgsList.find((org:any) => org.orgId === message.destOrgId);	
						
						validateSession(destOrg.accessToken, destOrg.instanceUrl, message.destOrgId)
						.then((result:any) => {
							if(result.valid) {
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
							}
						}).catch((error) => {
							panel.webview.postMessage({ command: 'previewerror', message:'Unable to connect to the Org.' });
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

						validateSession(destOrg.accessToken, destOrg.instanceUrl, message.destOrgId)
						.then((result:any) => {
							if(result.valid) {
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
							}
						}).catch((error) => {
							panel.webview.postMessage({ command: 'previewerror', message:'Unable to connect to the Org.' });
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
						if(message.scrollTo !== '') {
							setTimeout(() => scrollTo(message.scrollTo), 1000);
						}						
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

async function scrollTo(text: string) {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        return;
    }

    const doc = editor.document;
    const textPosition = doc.getText().indexOf(text);

    if (textPosition === -1) {
        return;
    }

    const pos = doc.positionAt(textPosition);
    const range = new vscode.Range(pos, pos);
    editor.selection = new vscode.Selection(pos, pos);
    editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
}

function validateSession(accessToken:string, endPoint:string, orgId:string) {
	return new Promise((resolve, reject) => {
		sendSoapAPIRequest(accessToken, endPoint, '<urn:getUserInfo/>')
		.then((result:any) => {
			resolve({valid: true});
		}).catch((error:any) => {
			if(error.indexOf('INVALID_SESSION_ID') >= 0) {
				let attempts = 0;
				function retry() {
					attempts++;
					getAuthOrgs().then((orgsList:any) => {
						let org = orgsList.find((org:any) => org.orgId === orgId);
						return sendSoapAPIRequest(org.accessToken, org.instanceUrl, '<urn:getUserInfo/>')
							.then((res) => {
								resolve({ valid: true, orgsList });
							})
							.catch((err) => {
								if (attempts < 5) {
									retry();
								} else {
									reject(new Error('Max retries reached. Session validation failed.'));
								}
							}
						);
					});					  
				}
				retry();
			}
        });;
    });
}

function saveMetadata(metadata:any, sobjects:any, fsPath:string, orgId:string) {
	Array.from(sobjects.values()).flat().forEach((name:any) => {
		metadata.get('CustomField').push({ name, type:'CustomField', lastModifiedByName:'', lastModifiedDate:'', parent:'CustomObject' });
	});
	const now = new Date();
	metadata.set('Timestamp', `${now.toLocaleDateString()} ${now.toLocaleTimeString()}`);
	const dir = path.dirname(fsPath+"/"+orgId+"/metadata.json");
	if (!fs.existsSync(dir)) {
		fs.mkdirSync(dir, { recursive: true });
	}	
	fs.writeFile(fsPath+"/"+orgId+"/metadata.json", JSON.stringify(Array.from(metadata), null, 2), 'utf8', (err:any) => {
		if (err) {
			vscode.window.showErrorMessage(`Error..!! ${err}`);
		}
	});   
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
		sendSoapMDRequest(accessToken, endPoint, '<met:cancelDeploy><met:String>'+deployJobId+'</met:String></met:cancelDeploy>')
		.then((result:any) => {
			const res = result['cancelDeployResponse']['result'];	
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
		sendSoapMDRequest(accessToken, endPoint, '<met:deployRecentValidation><met:validationId>'+deployJobId+
			'</met:validationId></met:deployRecentValidation>')
		.then((result:any) => {
			const res = result['deployRecentValidationResponse']['result'];	
			resolve(res);
        })
        .catch((error:any) => {
            reject(error);			
        });
    });
}

function deployStatus(accessToken:string, endPoint:string, deployJobId:string) {
    return new Promise((resolve, reject) => {
		sendSoapMDRequest(accessToken, endPoint, '<met:checkDeployStatus><met:asyncProcessId>'+deployJobId+
			'</met:asyncProcessId><met:includeDetails>true</met:includeDetails></met:checkDeployStatus>')
		.then((result:any) => {
			const res = result['checkDeployStatusResponse']['result'];	
			resolve(res);
        })
        .catch((error:any) => {
            reject(error);			
        });
    });
}

function deploy(accessToken:string, endPoint:string, zipfile:string, checkOnly:boolean, testLevel:string, testClasses:string) {
    return new Promise((resolve, reject) => {
		sendSoapMDRequest(accessToken, endPoint, '<met:deploy><met:ZipFile>'+zipfile+'</met:ZipFile><met:DeployOptions>'+
			'<met:checkOnly>'+checkOnly+'</met:checkOnly><met:testLevel>'+testLevel+'</met:testLevel>'+testClasses+
			'<met:singlePackage>true</met:singlePackage></met:DeployOptions></met:deploy>')
		.then((result:any) => {
			const retrieveId = result['deployResponse']['result']['id'];	
			resolve(retrieveId);	
        })
        .catch((error:any) => {
            reject(error);			
        });
    });
}

function retrieveStatus(accessToken:string, endPoint:string, retrieveJobId:string) {
    return new Promise((resolve, reject) => {
		sendSoapMDRequest(accessToken, endPoint, '<met:checkRetrieveStatus><met:asyncProcessId>'+retrieveJobId+
			'</met:asyncProcessId><met:includeZip>true</met:includeZip></met:checkRetrieveStatus>')
		.then((result:any) => {
			const res = result['checkRetrieveStatusResponse']['result'];	
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
		sendSoapMDRequest(accessToken, endPoint, '<met:retrieve><met:retrieveRequest><met:apiVersion>62.0</met:apiVersion>'+
			'<met:singlePackage>true</met:singlePackage><met:unpackaged>'+packagexml+'</met:unpackaged></met:retrieveRequest></met:retrieve>')
		.then((result:any) => {
			const retrieveId = result['retrieveResponse']['result']['id'];	
			resolve(retrieveId);
        })
        .catch((error:any) => {
            reject(error);			
        });
    });
}

function getTypesComponents(accessToken:string, endPoint:string, globalStorageUri:string, panel:vscode.WebviewPanel) {
    return new Promise((resolve, reject) => {
		let components = new Map();
		let sobjects = new Map();
		sendSoapMDRequest(accessToken, endPoint, '<met:describeMetadata><met:asOfVersion>62.0</met:asOfVersion></met:describeMetadata>')
		.then((result:any) => {
			const types = result['describeMetadataResponse']['result']['metadataObjects'];			
			const typesList:{name:string; inFolder:string; parent:string;}[] = [];
			types.forEach((element:any) => {
				typesList.push({ name: element['xmlName'], inFolder: element['inFolder'], parent:''});
				if(element['childXmlNames']) {
					let tmp = element['childXmlNames'] instanceof Array ? element['childXmlNames'] : [element['childXmlNames']];
					tmp.forEach((childname:any) => {
						typesList.push({ name: childname, inFolder: 'false', parent: element['xmlName']});
					});	
				}
			});		
			panel.webview.postMessage({ command: 'loading', message: 'Refreshing Components(0/'+typesList.length+')'});	

			Promise.all(typesList.map((e:{name:string; inFolder:string; parent:string;}) => {				
				return sendSoapMDRequest(accessToken, endPoint, '<met:listMetadata><met:queries><met:type>'
											+(e.inFolder === 'true' ? (e.name === 'EmailTemplate' ? 'EmailFolder' : e.name+'Folder') : e.name)
											+'</met:type></met:queries></met:listMetadata>')
					.then((result:any) => {
						const comps = result['listMetadataResponse'];
						let results = buildComponents(comps, e.parent);	
						if(e.inFolder === 'true') {
							let folderresults:Object[] = [];	
							return Promise.all(results.map((element:any) => {
								return sendSoapMDRequest(accessToken, endPoint, '<met:listMetadata><met:queries><met:type>'+e.name+
									'</met:type><met:folder>'+element.name+'</met:folder></met:queries></met:listMetadata>')
								.then((result:any) => {
									const comps = result['listMetadataResponse'];
									let fldresults = buildComponents(comps, e.parent);	
									element.type = e.name;
									folderresults = [...folderresults, ...fldresults, element];
								});
							}))
							.then(() => {
								components.set(e.name, folderresults);
								panel.webview.postMessage({ command: 'loading', message: 'Refreshing Components('+components.size+'/'+typesList.length+')'});
								panel.webview.postMessage({ command: 'components', components:folderresults, type:e.name });	
							}).catch(error => {
								vscode.window.showErrorMessage(`Error ${error}`);
							});	
						} else if(e.name === 'CustomObject') {
							components.set(e.name, results);
							panel.webview.postMessage({ command: 'components', components:results, type:e.name });
							const mdobjects = new Set(results.map(obj => obj.name));
							return sendSoapAPIRequest(accessToken, endPoint, '<urn:describeGlobal/>')
								.then((result:any) => {
									const comps = result['describeGlobalResponse']['result']['sobjects'];
									let objects:string[] = [];	
									comps.forEach((e:any) => {
										if(e['custom'] === 'false' && e['layoutable'] === 'true' && mdobjects.has(e['name'])) {
											objects.push(e['name']);
										}
									});
									const chunks = [];
									for (let i = 0; i < objects.length; i += 100) {
										chunks.push(objects.slice(i, i + 100));
									}
									return Promise.all(chunks.map((chunk:string[]) => {
										var payload = '';
										chunk.forEach((e:any) => {
											payload += '<urn:sObjectType>'+e+'</urn:sObjectType>';
										});
										return sendSoapAPIRequest(accessToken, endPoint, '<urn:describeSObjects>'+ payload + '</urn:describeSObjects>')
										.then((result:any) => {
											const objs = result['describeSObjectsResponse']['result'];
											const exclFields = new Set(['Id', 'IsDeleted', 'CreatedById', 'CreatedDate', 'LastModifiedById', 'LastModifiedDate', 
												'LastReferencedDate', 'LastViewedDate', 'SystemModstamp', 'MasterRecordId', 'LastActivityDate']);
											objs.forEach((obj:any) => {
												let tmp:string[] = [];
												obj['fields'].forEach((e:any) => {
													if(e['custom'] === 'false' && !exclFields.has(e['name']) && (e['compoundFieldName'] === undefined || e['compoundFieldName'] === 'Name')) {
														tmp.push(obj['name']+'.'+e['name']);
													}
												});
												sobjects.set(obj['name'], tmp);
												panel.webview.postMessage({ command: 'stdFields', name:obj['name'], fields: tmp});
											});	
										}).catch(error => {
											vscode.window.showErrorMessage(`Error ${error}`);
										});
									}))
									.then(() => {
									}).catch(error => {
										vscode.window.showErrorMessage(`Error ${error}`);
									});			
								}
							).catch(error => {
								vscode.window.showErrorMessage(`Error ${error}`);
							});
						} else {
							if(e.name === 'StandardValueSet') {
								results = [];						
								STD_VALUE_SET.forEach((e) => {
									results.push({name: e, type: 'StandardValueSet', lastModifiedByName:'', lastModifiedDate: '', parent: ''});
								});
							}
							components.set(e.name, results);
							panel.webview.postMessage({ command: 'loading', message: 'Refreshing Components('+components.size+'/'+typesList.length+')'});
							panel.webview.postMessage({ command: 'components', components:results, type:e.name });
						}			
					}
				).catch(error => {
					vscode.window.showErrorMessage(`Error ${error}`);
				});		
			}))
			.then(() => {
				resolve({'components': components, 'sobjects':sobjects});
			}).catch(error => {
				vscode.window.showErrorMessage(`Error ${error}`);
			});
        })
        .catch((error:any) => {
            reject(error);			
        });
    });
}

function buildComponents(comps:any, parent:string) {
	let results: { name: string; type: string, lastModifiedByName: string; lastModifiedDate: string; parent:string;}[] = [];
	let auditDate = '1970-01-01T00:00:00.000Z';
	if(comps !== "") {
		let tmp = comps['result'] instanceof Array ? comps['result'] : [comps['result']];
		results = tmp.map((comp: any) => ({
			name: comp['fullName'],
			type: comp['type'],
			parent: parent,
			lastModifiedByName: comp['lastModifiedByName'],
			lastModifiedDate: comp['lastModifiedDate'] !== auditDate ? new Date(comp['lastModifiedDate']).toLocaleDateString() : 
						comp['createdDate'] !== auditDate ? new Date(comp['createdDate']).toLocaleDateString() : ''
		}));	
		results = Array.from(
			new Map(results.map(item => [item.type+item.name, item])).values()
		);	
	}
	return results;
}

function sendSoapMDRequest(accessToken:string,  endPoint:string, body:string) {
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
				resolve(result['soapenv:Envelope']['soapenv:Body']);
			});
		})
		.catch((error:any) => {
			parser.parseString(error.response.data, (err:any, result:any) => {	
				reject(result['soapenv:Envelope']['soapenv:Body']['soapenv:Fault']['faultstring']);
			});		
		});
	});
}

function sendSoapAPIRequest(accessToken:string,  endPoint:string, body:string) {
	const parser = new xml2js.Parser({ explicitArray: false, ignoreAttrs: true });	
	let request =  '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:urn="urn:partner.soap.sforce.com">'+
		'<soapenv:Header><urn:SessionHeader><urn:sessionId>'+accessToken+'</urn:sessionId></urn:SessionHeader></soapenv:Header>'+
		'<soapenv:Body>'+body+'</soapenv:Body></soapenv:Envelope>';
	
	return new Promise((resolve, reject) => {
		axios.post(endPoint+"/services/Soap/u/62.0", request, { headers: {
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
				resolve(result['soapenv:Envelope']['soapenv:Body']);
			});
		})
		.catch((error:any) => {
			parser.parseString(error.response.data, (err:any, result:any) => {	
				reject(result['soapenv:Envelope']['soapenv:Body']['soapenv:Fault']['faultstring']);
			});		
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
						if((org.connectedStatus === 'Connected' || org.status === 'Active') && orgIds.indexOf(org['orgId']) < 0) {
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

function refreshOrgs() {
    return new Promise((resolve, reject) => {
        const orgsDir = path.join(process.env.HOME || process.env.USERPROFILE || '', '.sfdx');    
		const alias = JSON.parse(fs.readFileSync(orgsDir+'/alias.json', 'utf-8'));
		console.log(alias.orgs);
		/*fs.readFil(orgsDir+'/alias.json', (err, files) => {
			if (err) {
				console.error("Error reading orgs directory:", err);
				return;
			}

			const orgs = files.map(file => path.basename(file, '.json'));
			console.log("Authorized Orgs:", orgs);
		});*/
    });
}

function getWebviewContent(basedpath:string, scriptUri:vscode.Uri, cssUri:vscode.Uri) {

	return `<!doctype html>
			<html lang="en">
			<head>
				<meta charset="UTF-8" />
				<meta name="viewport" content="width=device-width, initial-scale=1.0" />
				<title>Salesforce Deployment Suite</title>
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
					<div style="display:flex;justify-content: space-between;align-items: center;">	
						<h1>Salesforce Deployment Suite</h1>		
						<a href="https://github.com/rjallu9/salesforce-deployment-suite/issues" title="Report issue" style="height"25px;">
							<svg width="25px" height="25px" viewBox="0 0 36 36" version="1.1"  preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
								<circle cx="18" cy="18" r="14" fill="#0078d4"/>
								<text x="18" y="20" font-family="Arial" font-size="20" text-anchor="middle" alignment-baseline="middle" fill="white">?</text>
							</svg>
						</a>		
					</div>
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

