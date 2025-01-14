"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const path = require('path');
const axios = require('axios');
const xml2js = require('xml2js');
const { exec } = require('child_process');
const fs = require('fs');
const AdmZip = require('adm-zip');
let tmpDirectory = '';
function activate(context) {
    const disposable = vscode.commands.registerCommand('salesforce-deployment-tool.build', () => {
        const panel = vscode.window.createWebviewPanel('packageBuilder', 'Salesforce Deployment Tool', vscode.ViewColumn.One, { enableScripts: true, retainContextWhenHidden: true });
        const scriptPath = vscode.Uri.file(path.join(context.extensionPath, 'src', 'assets/index.js'));
        const scriptUri = panel.webview.asWebviewUri(scriptPath);
        const cssPath = vscode.Uri.file(path.join(context.extensionPath, 'src', 'assets/index.css'));
        const cssUri = panel.webview.asWebviewUri(cssPath);
        panel.webview.html = getWebviewContent(context.extensionPath, scriptUri, cssUri);
        let orgsList = [];
        let isCancelDeploy = false;
        tmpDirectory = context.globalStorageUri.fsPath + "/tmp";
        panel.webview.onDidReceiveMessage((message) => {
            switch (message.command) {
                case 'getAuthOrgs':
                    getAuthOrgs().then((result) => {
                        orgsList = result;
                        panel.webview.postMessage({ command: 'orgsList', orgs: result });
                    });
                    break;
                case 'loadTypes':
                    var sourceOrg = orgsList.find((org) => org.orgId === message.sourceOrgId);
                    let selections = [];
                    const selectionsPath = path.join(context.globalStorageUri.fsPath, 'selections.json');
                    if (fs.existsSync(selectionsPath)) {
                        selections = JSON.parse(fs.readFileSync(selectionsPath, 'utf-8'));
                    }
                    getTypes(sourceOrg.accessToken, sourceOrg.instanceUrl, context.globalStorageUri.fsPath)
                        .then((data) => {
                        panel.webview.postMessage({ command: 'types', types: data, selections: selections });
                    });
                    break;
                case 'loadComponents':
                    if (message.type) {
                        var sourceOrg = orgsList.find((org) => org.orgId === message.sourceOrgId);
                        getComponents(sourceOrg.accessToken, sourceOrg.instanceUrl, message.type, message.isFolder)
                            .then((data) => {
                            panel.webview.postMessage({ command: 'components', components: data, type: message.type });
                        }).catch((error) => {
                            panel.webview.postMessage({ command: 'components', components: [], type: message.type });
                        });
                        ;
                    }
                    break;
                case 'updateFavorites':
                    if (message.data) {
                        const dir = path.dirname(context.globalStorageUri.fsPath + "/favorites.json");
                        if (!fs.existsSync(dir)) {
                            fs.mkdirSync(dir, { recursive: true });
                        }
                        fs.writeFileSync(context.globalStorageUri.fsPath + "/favorites.json", JSON.stringify(message.data, null, 2), 'utf8', (err) => {
                            if (err) {
                                vscode.window.showErrorMessage(`Unable to update favorites..!!`);
                            }
                        });
                    }
                    break;
                case 'updateSelections':
                    if (message.data) {
                        const dir = path.dirname(context.globalStorageUri.fsPath + "/selections.json");
                        if (!fs.existsSync(dir)) {
                            fs.mkdirSync(dir, { recursive: true });
                        }
                        fs.writeFile(context.globalStorageUri.fsPath + "/selections.json", JSON.stringify(message.data, null, 2), 'utf8', (err) => {
                            if (err) {
                                vscode.window.showErrorMessage(`Unable to update selections..!!`);
                            }
                        });
                    }
                    break;
                case 'deploy':
                    panel.webview.postMessage({ command: 'deployStatus', result: { stage: "retrieve", message: 'Retrieve components Initiated' } });
                    var sourceOrg = orgsList.find((org) => org.orgId === message.sourceOrgId);
                    var destOrg = orgsList.find((org) => org.orgId === message.destOrgId);
                    retrieve(sourceOrg.accessToken, sourceOrg.instanceUrl, message.packagexml).then((result) => {
                        panel.webview.postMessage({ command: 'deployStatus', result: { stage: "retrieve", message: 'Retrieve components Inprogress' } });
                        let retrieveJobId = result;
                        let intervalId = setInterval(() => {
                            retrieveStatus(sourceOrg.accessToken, sourceOrg.instanceUrl, retrieveJobId).then((result) => {
                                if (result.done === 'true') {
                                    panel.webview.postMessage({ command: 'deployStatus', result: { stage: "retrieveCompleted", message: 'Retrieve components Completed' } });
                                    clearInterval(intervalId);
                                    if (!isCancelDeploy) {
                                        panel.webview.postMessage({ command: 'deployStatus', result: { stage: "deployment",
                                                message: message.checkOnly ? 'Validation Initiated' : 'Deployment Initiated' } });
                                        deploy(destOrg.accessToken, destOrg.instanceUrl, result.zipFile, message.checkOnly, message.testLevel, message.testClasses).then((result) => {
                                            let deployJobId = result;
                                            let deployIntervalId = setInterval(() => {
                                                if (isCancelDeploy) {
                                                    cancelDeploy(destOrg.accessToken, destOrg.instanceUrl, deployJobId);
                                                    isCancelDeploy = false;
                                                }
                                                deployStatus(destOrg.accessToken, destOrg.instanceUrl, deployJobId).then((result) => {
                                                    if (result.done === 'true') {
                                                        clearInterval(deployIntervalId);
                                                    }
                                                    result['stage'] = "deploymentStatus";
                                                    panel.webview.postMessage({ command: 'deployStatus', result: result });
                                                }).catch((error) => {
                                                    clearInterval(deployIntervalId);
                                                });
                                            }, 2000);
                                        });
                                    }
                                    else {
                                        panel.webview.postMessage({ command: 'deployStatus', result: { stage: "deployment",
                                                message: message.checkOnly ? 'Validation Cancelled' : 'Deployment Cancelled' } });
                                    }
                                }
                            }).catch((error) => {
                                clearInterval(intervalId);
                            });
                        }, 1000);
                    });
                    break;
                case 'quickDeploy':
                    var destOrg = orgsList.find((org) => org.orgId === message.destOrgId);
                    panel.webview.postMessage({ command: 'deployStatus', result: { stage: "deployment", message: 'Deployment Initiated' } });
                    quickDeploy(destOrg.accessToken, destOrg.instanceUrl, message.id).then((result) => {
                        let deployJobId = result;
                        let intervalId = setInterval(() => {
                            deployStatus(destOrg.accessToken, destOrg.instanceUrl, deployJobId).then((result) => {
                                if (result.done === 'true') {
                                    clearInterval(intervalId);
                                }
                                result['stage'] = "deploymentStatus";
                                panel.webview.postMessage({ command: 'deployStatus', result: result });
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
                    var sourceOrg = orgsList.find((org) => org.orgId === message.sourceOrgId);
                    var destOrg = orgsList.find((org) => org.orgId === message.destOrgId);
                    var time = Date.now();
                    let sourceProcess = false, destProcess = false;
                    retrieve(sourceOrg.accessToken, sourceOrg.instanceUrl, message.packagexml).then((result) => {
                        let retrieveJobId = result;
                        let intervalId = setInterval(() => {
                            retrieveStatus(sourceOrg.accessToken, sourceOrg.instanceUrl, retrieveJobId).then((result) => {
                                if (result.done === 'true') {
                                    clearInterval(intervalId);
                                    sourceOrgFiles = result.fileNames;
                                    extractComponents(result.zipFile, tmpDirectory + '/' + time, sourceOrg.alias);
                                    sourceProcess = true;
                                }
                            }).catch((error) => {
                                vscode.window.showErrorMessage(`Error: ${JSON.stringify(error)}`);
                                clearInterval(intervalId);
                            });
                        }, 1000);
                    });
                    retrieve(destOrg.accessToken, destOrg.instanceUrl, message.packagexml).then((result) => {
                        let destRetrieveJobId = result;
                        let destIntervalId = setInterval(() => {
                            retrieveStatus(destOrg.accessToken, destOrg.instanceUrl, destRetrieveJobId).then((result) => {
                                if (result.done === 'true') {
                                    clearInterval(destIntervalId);
                                    destOrgFiles = result.fileNames;
                                    extractComponents(result.zipFile, tmpDirectory + '/' + time, destOrg.alias);
                                    destProcess = true;
                                }
                            }).catch((error) => {
                                vscode.window.showErrorMessage(`Error: ${JSON.stringify(error)}`);
                                clearInterval(destIntervalId);
                            });
                        }, 1000);
                    });
                    let responseIntervalId = setInterval(() => {
                        if (sourceProcess && destProcess) {
                            postCompareResults(sourceOrgFiles, destOrgFiles, tmpDirectory + "/" + time + "/" + sourceOrg.alias, tmpDirectory + "/" + time + "/" + destOrg.alias, panel);
                            clearInterval(responseIntervalId);
                        }
                    }, 1000);
                    break;
                case 'filePreview':
                    let title = message.file + ': Source ↔ Target';
                    vscode.commands.executeCommand('vscode.diff', vscode.Uri.file(message.source), vscode.Uri.file(message.dest), title, { preview: false });
                    break;
                default:
                    console.log('Unknown command:', message.command);
            }
        });
        panel.onDidDispose(() => {
            if (tmpDirectory && fs.existsSync(tmpDirectory)) {
                try {
                    fs.rmSync(tmpDirectory, { recursive: true, force: true });
                }
                catch (err) {
                }
            }
        });
    });
    context.subscriptions.push(disposable);
}
function postCompareResults(sourceOrgFiles, destOrgFiles, sourceOrgPath, destOrgPath, panel) {
    let files = [];
    sourceOrgFiles.forEach((value, key) => {
        let tmp = { name: key, source: sourceOrgPath + "/" + value, dest: "" };
        if (destOrgFiles.has(key)) {
            tmp.dest = destOrgPath + "/" + destOrgFiles.get(key);
        }
        files.push(tmp);
    });
    panel.webview.postMessage({ command: 'compareResults', files: files });
}
function extractComponents(zipfile, directory, alias) {
    const buffer = Buffer.from(zipfile, 'base64');
    if (!fs.existsSync(directory + "/" + alias)) {
        fs.mkdirSync(directory + "/" + alias, { recursive: true });
    }
    const zipFilePath = path.join(directory, alias + '.zip');
    fs.writeFileSync(zipFilePath, buffer);
    const zip = new AdmZip(zipFilePath);
    zip.extractAllTo(directory + "/" + alias, true);
}
function cancelDeploy(accessToken, endPoint, deployJobId) {
    return new Promise((resolve, reject) => {
        sendSoapReuest(accessToken, endPoint, '<met:cancelDeploy><met:String>' + deployJobId + '</met:String></met:cancelDeploy>')
            .then((result) => {
            const res = result['soapenv:Envelope']['soapenv:Body']['cancelDeployResponse']['result'];
            resolve(res);
        })
            .catch((error) => {
            vscode.window.showErrorMessage(`Error: ${JSON.stringify(error)}`);
            reject(error);
        });
    });
}
function quickDeploy(accessToken, endPoint, deployJobId) {
    return new Promise((resolve, reject) => {
        sendSoapReuest(accessToken, endPoint, '<met:deployRecentValidation><met:validationId>' + deployJobId +
            '</met:validationId></met:deployRecentValidation>')
            .then((result) => {
            const res = result['soapenv:Envelope']['soapenv:Body']['deployRecentValidationResponse']['result'];
            resolve(res);
        })
            .catch((error) => {
            reject(error);
        });
    });
}
function deployStatus(accessToken, endPoint, deployJobId) {
    return new Promise((resolve, reject) => {
        sendSoapReuest(accessToken, endPoint, '<met:checkDeployStatus><met:asyncProcessId>' + deployJobId +
            '</met:asyncProcessId><met:includeDetails>true</met:includeDetails></met:checkDeployStatus>')
            .then((result) => {
            const res = result['soapenv:Envelope']['soapenv:Body']['checkDeployStatusResponse']['result'];
            resolve(res);
        })
            .catch((error) => {
            reject(error);
        });
    });
}
function deploy(accessToken, endPoint, zipfile, checkOnly, testLevel, testClasses) {
    return new Promise((resolve, reject) => {
        sendSoapReuest(accessToken, endPoint, '<met:deploy><met:ZipFile>' + zipfile + '</met:ZipFile><met:DeployOptions>' +
            '<met:checkOnly>' + checkOnly + '</met:checkOnly><met:testLevel>' + testLevel + '</met:testLevel>' + testClasses +
            '<met:singlePackage>true</met:singlePackage></met:DeployOptions></met:deploy>')
            .then((result) => {
            const retrieveId = result['soapenv:Envelope']['soapenv:Body']['deployResponse']['result']['id'];
            resolve(retrieveId);
        })
            .catch((error) => {
            reject(error);
        });
    });
}
function retrieveStatus(accessToken, endPoint, retrieveJobId) {
    return new Promise((resolve, reject) => {
        sendSoapReuest(accessToken, endPoint, '<met:checkRetrieveStatus><met:asyncProcessId>' + retrieveJobId +
            '</met:asyncProcessId><met:includeZip>true</met:includeZip></met:checkRetrieveStatus>')
            .then((result) => {
            const res = result['soapenv:Envelope']['soapenv:Body']['checkRetrieveStatusResponse']['result'];
            let fileNames = new Map();
            if (res['done'] === 'true') {
                if (res['fileProperties'] instanceof Array) {
                    res['fileProperties'].forEach((file) => {
                        fileNames.set(file.type + "." + file.fullName, file.fileName);
                    });
                }
                else {
                    fileNames.set(res['fileProperties'].type + "." + res['fileProperties'].fullName, res['fileProperties'].fileName);
                }
            }
            resolve({
                done: res['done'],
                zipFile: res['zipFile'],
                fileNames: fileNames
            });
        })
            .catch((error) => {
            reject(error);
        });
    });
}
function retrieve(accessToken, endPoint, packagexml) {
    return new Promise((resolve, reject) => {
        sendSoapReuest(accessToken, endPoint, '<met:retrieve><met:retrieveRequest><met:apiVersion>62.0</met:apiVersion>' +
            '<met:singlePackage>true</met:singlePackage><met:unpackaged>' + packagexml + '</met:unpackaged></met:retrieveRequest></met:retrieve>')
            .then((result) => {
            const retrieveId = result['soapenv:Envelope']['soapenv:Body']['retrieveResponse']['result']['id'];
            resolve(retrieveId);
        })
            .catch((error) => {
            reject(error);
        });
    });
}
function getComponents(accessToken, endPoint, type, isFolder) {
    return new Promise((resolve, reject) => {
        sendSoapReuest(accessToken, endPoint, '<met:listMetadata><met:queries><met:type>' + type + (isFolder ? 'Folder' : '') + '</met:type></met:queries></met:listMetadata>')
            .then((result) => {
            const comps = result['soapenv:Envelope']['soapenv:Body']['listMetadataResponse'];
            let results = buildComponents(comps);
            if (isFolder) {
                let folderresults = [];
                const promises = results.map((element) => {
                    return sendSoapReuest(accessToken, endPoint, '<met:listMetadata><met:queries><met:type>' + type +
                        '</met:type><met:folder>' + element.name + '</met:folder></met:queries></met:listMetadata>')
                        .then((result) => {
                        const comps = result['soapenv:Envelope']['soapenv:Body']['listMetadataResponse'];
                        let fldresults = buildComponents(comps);
                        folderresults = [...folderresults, ...fldresults];
                    });
                });
                Promise.all(promises)
                    .then(() => {
                    resolve(folderresults);
                });
            }
            else {
                resolve(results);
            }
        })
            .catch((error) => {
            reject(error);
        });
    });
}
function buildComponents(comps) {
    let results = [];
    if (comps !== "") {
        if (comps['result'] instanceof Array) {
            results = comps['result'].map((comp) => ({
                name: comp['fullName'],
                type: comp['type'],
                lastModifiedByName: comp['lastModifiedByName'],
                lastModifiedDate: new Date(comp['lastModifiedDate']).toLocaleDateString(),
                manageableState: comp['manageableState']
            }));
        }
        else {
            results.push({
                name: comps['result']['fullName'],
                type: comps['result']['type'],
                lastModifiedByName: comps['result']['lastModifiedByName'],
                lastModifiedDate: new Date(comps['lastModifiedDate']).toLocaleDateString(),
                manageableState: comps['manageableState']
            });
        }
    }
    return results;
}
function getTypes(accessToken, endPoint, globalStorageUri) {
    let favorites = [];
    const favoritesPath = path.join(globalStorageUri, 'favorites.json');
    if (fs.existsSync(favoritesPath)) {
        favorites = JSON.parse(fs.readFileSync(favoritesPath, 'utf-8'));
    }
    return new Promise((resolve, reject) => {
        sendSoapReuest(accessToken, endPoint, '<met:describeMetadata><met:asOfVersion>62.0</met:asOfVersion></met:describeMetadata>')
            .then((result) => {
            const types = result['soapenv:Envelope']['soapenv:Body']['describeMetadataResponse']['result']['metadataObjects'];
            const typesList = [];
            types.forEach((element) => {
                typesList.push({
                    name: element['xmlName'],
                    isFavorite: favorites.indexOf(element['xmlName']) >= 0,
                    hidden: false,
                    inFolder: element['inFolder']
                });
                if (element['childXmlNames']) {
                    if (element['childXmlNames'] instanceof Array) {
                        element['childXmlNames'].forEach((childname) => {
                            typesList.push({
                                name: childname,
                                isFavorite: favorites.indexOf(element['xmlName']) >= 0,
                                hidden: false,
                                inFolder: 'false'
                            });
                        });
                    }
                    else {
                        typesList.push({
                            name: element['childXmlNames'],
                            isFavorite: favorites.indexOf(element['xmlName']) >= 0,
                            hidden: false,
                            inFolder: 'false'
                        });
                    }
                }
            });
            resolve(typesList);
        })
            .catch((error) => {
            reject(error);
        });
    });
}
function sendSoapReuest(accessToken, endPoint, body) {
    const parser = new xml2js.Parser({ explicitArray: false, ignoreAttrs: true });
    let reuest = '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:met="http://soap.sforce.com/2006/04/metadata">' +
        '<soapenv:Header><met:SessionHeader><met:sessionId>' + accessToken + '</met:sessionId></met:SessionHeader></soapenv:Header>' +
        '<soapenv:Body>' + body + '</soapenv:Body></soapenv:Envelope>';
    return new Promise((resolve, reject) => {
        axios.post(endPoint + "/services/Soap/m/62.0", reuest, { headers: {
                'Content-Type': 'text/xml; charset=utf-8',
                'SOAPAction': 'Update',
            },
        }).then((response) => {
            parser.parseString(response.data, (err, result) => {
                if (err) {
                    vscode.window.showErrorMessage("Error parsing SOAP XML:", err);
                    return;
                }
                resolve(result);
            });
        })
            .catch((error) => {
            parser.parseString(error.response.data, (err, result) => {
                /*vscode.window.showWarningMessage('Unable to connect to the Org. Message: '+
                    result['soapenv:Envelope']['soapenv:Body']['soapenv:Fault']['faultstring']);*/
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
        });*/
        resolve([{ "alias": "SiriApp", "name": "SiriApp(ramu.jallu@yahoo.in)", "orgId": "00D6g00000360OaEAI", "instanceUrl": "https://siriapp-dev-ed.my.salesforce.com",
                "accessToken": "00D6g00000360Oa!AQcAQF7uyZFdvQOMRFAetbpFchusNaFwiW93T0hUpSGJvGigA9jLMvY9_eyFJvfCcVhK7G3rR1vU3cvVHXvpI9Fg4qLr8hMz" },
            { "alias": "ICE", "name": "ICE(ramu.jallu@gmail.com)", "orgId": "00D3t000004pIgVEAU", "instanceUrl": "https://ice7-dev-ed.my.salesforce.com",
                "accessToken": "00D3t000004pIgV!AQgAQN2Rop2gVzrvqsKCH_.O5jinKNkn5CtJApXLXLWLhyxe6m.MjUDKwem1UmTEHJA34h6mbxPo0JW0BX07rUy_EB2FO7wa" },
            { "name": "AgentForce(epic.321e1730601128842@orgfarm.th)", "orgId": "00D6P000000kU2zUAE", "instanceUrl": "https://d6p000000ku2zuae-dev-ed.develop.my.salesforce.com",
                "accessToken": "00D6P000000kU2z!AQ4AQDkTYbK6nbyv1Yn2HOMipXHkNxI.7RozVfEDATrZSHRARBYMZDEhuxKJsU84JNgBl0CudDmcSws4x7_JXHIkpYmjstLp" }]);
    });
}
function getWebviewContent(basedpath, scriptUri, cssUri) {
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
											<th>Name</th>
											<th>Type</th>
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
function deactivate() {
    if (tmpDirectory && fs.existsSync(tmpDirectory)) {
        try {
            fs.rmSync(tmpDirectory, { recursive: true, force: true });
        }
        catch (err) {
        }
    }
}
//# sourceMappingURL=extension.js.map