import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as chokidar from 'chokidar';


export function activate(context: vscode.ExtensionContext) {
	console.debug("Activating Hypar Code.");

	let title = "Hypar Preview";
	if(vscode.workspace.name) {
		title = vscode.workspace.name;
	}

	context.subscriptions.push(
		vscode.commands.registerCommand('hypar.preview', ()=>{
			HyparPanel.createOrShow(context.extensionPath, title);
		})
	);

	if(vscode.window.registerWebviewPanelSerializer) {
		vscode.window.registerWebviewPanelSerializer(HyparPanel.viewType, {
			async deserializeWebviewPanel(webviewPanel: vscode.WebviewPanel, state: any) {
				console.log(`Got state: ${state}`);
				HyparPanel.revive(webviewPanel, context.extensionPath, title);
			}
		});
	}

	let type = 'hypar';
	vscode.tasks.registerTaskProvider(type, {
		provideTasks: () => {
			
			// https://stackoverflow.com/questions/55135876/extension-api-task-provider-build-task-example
			
			if(!vscode.workspace.workspaceFolders) {
				return [];
			}

			let hyparPath = path.join(vscode.workspace.workspaceFolders[0].uri.fsPath, 'hypar.json');
			if(!fs.existsSync(hyparPath)) {
				return [];
			}
	
			let runTask = new vscode.Task(
				{type: type, task:'run'},
				vscode.TaskScope.Workspace,
				'Run',
				'Hypar',
				new vscode.ShellExecution('hypar run'), []
			);
	
			let initTask = new vscode.Task(
				{type: type, task: 'init'},
				vscode.TaskScope.Workspace,
				'Init',
				'Hypar',
				new vscode.ShellExecution('hypar init'), []
			);
	
			let publishTask = new vscode.Task(
				{type: type, task: 'publish'},
				vscode.TaskScope.Workspace,
				'Publish',
				'Hypar',
				new vscode.ShellExecution('hypar publish'), []
			);
	
			return [runTask, initTask, publishTask];
		},
		resolveTask(_task: vscode.Task): vscode.Task | undefined {
			return undefined;
		}
	});
}

class HyparPanel {
	/**
	 * Track the current panel. Only allow a single panel to exist at a time.
	 */
	public static currentPanel: HyparPanel | undefined;
	public static readonly viewType = 'hypar';
	private readonly _panel: vscode.WebviewPanel;
	private _disposables: vscode.Disposable[] = [];
	private readonly _extensionPath: string;
	private _inputs: { [name: string]: Number; } = { };

	public static createOrShow(extensionPath: string, title: string) {
		const column = vscode.ViewColumn.Two;

		// If we already have a panel, show it.
		if (HyparPanel.currentPanel) {
			console.debug("Revealing hypar code.");
			HyparPanel.currentPanel._panel.reveal(column);
			return;
		}

		let roots = [];
		roots.push(vscode.Uri.file(path.join(extensionPath, 'media')));
		if(vscode.workspace.workspaceFolders) {
			roots.push(vscode.workspace.workspaceFolders[0].uri);
		}

		// Otherwise, create a new panel.
		const panel = vscode.window.createWebviewPanel(
			HyparPanel.viewType,
			title,
			column || vscode.ViewColumn.One,
			{
				enableScripts: true,
				retainContextWhenHidden: true,
				localResourceRoots: roots
			}
		);
		
		HyparPanel.currentPanel = new HyparPanel(panel, extensionPath, title);

		let modelPath = path.join(extensionPath, 'media', 'model.glb');
		if(vscode.workspace.workspaceFolders) {
			modelPath = path.join(vscode.workspace.workspaceFolders[0].uri.fsPath, "model.glb");
		}

		let outputPath = path.join(extensionPath, 'media', 'output.json');
		if(vscode.workspace.workspaceFolders) {
			outputPath = path.join(vscode.workspace.workspaceFolders[0].uri.fsPath, "output.json");
		}
		
		// This is only to test in debug mode whether the outputs show up.
		if(!vscode.workspace.workspaceFolders) {
			HyparPanel.currentPanel._panel.webview.postMessage({command: 'update-data-display', data: {"Volume": 5}});
		}

		console.debug(`Watching ${modelPath}.`);
		const watcher = chokidar.watch(modelPath, {
			ignored: /(^|[\/\\])\../,
			persistent: true
		});
		watcher.on('change', (path:string, stats: fs.Stats)=>{
			if(HyparPanel.currentPanel) {
				if(!HyparPanel.currentPanel._panel.visible) {
					HyparPanel.currentPanel._panel.reveal();
				}
				console.debug(`${path} was changed. Reloading...`);
				HyparPanel.currentPanel._panel.webview.postMessage({command: 'load-model'});
				
				if(!vscode.workspace.workspaceFolders) {
					HyparPanel.currentPanel._panel.webview.postMessage({command: 'update-data-display', data: {"Volume": 5.012345678}});
				}
				else {
					fs.readFile(outputPath, 'utf8', (err:NodeJS.ErrnoException | null, data:string)=>{
						if(err) {
							console.warn(err);
							return;
						}
						var outputData = JSON.parse(data);
						if(HyparPanel.currentPanel) {
							HyparPanel.currentPanel._panel.webview.postMessage({command: 'update-data-display', data: outputData});
						}
					});	
				}
			}
		});
	}

	public static revive(panel: vscode.WebviewPanel, extensionPath: string, title: string) {
		console.debug("Reviving the web view.");
		HyparPanel.currentPanel = new HyparPanel(panel, extensionPath, title);
	}

	private constructor(panel: vscode.WebviewPanel, extensionPath: string, title: string ) {
		this._panel = panel;
		this._extensionPath = extensionPath;

		// Set the webview's initial html content
		console.debug("Updating on construction.");
		this._update(title);

		// Listen for when the panel is disposed
		// This happens when the user closes the panel or when the panel is closed programatically
		this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

		// Update the content based on view changes
		this._panel.onDidChangeViewState(
			(e:vscode.WebviewPanelOnDidChangeViewStateEvent) => {
				console.debug("Hypar view extension changed state. Nothing to do.");
			},
			null,
			this._disposables
		);
		
		// Handle messages from the webview
		this._panel.webview.onDidReceiveMessage(
			message => {
				switch (message.command) {
					case 'alert':
						vscode.window.showErrorMessage(message.text);
						return;
					case 'input-value-changed':
						// Write an updated input.json for the reader to watch
						console.debug(message);
						this._inputs[message.name] = Number.parseFloat(message.value);
						console.debug(JSON.stringify(this._inputs));
						if(vscode.workspace.workspaceFolders) {
							const inputPath = path.join(vscode.workspace.workspaceFolders[0].uri.fsPath, 'input.json');
							fs.writeFile(inputPath, JSON.stringify(this._inputs), (err)=>{
								if(err) {
									console.warn(err);
								}
							});
						}
						return;
				}
			},
			null,
			this._disposables
		);
	}

	public dispose() {
		HyparPanel.currentPanel = undefined;

		// Clean up our resources
		this._panel.dispose();

		while (this._disposables.length) {
			const x = this._disposables.pop();
			if (x) {
				x.dispose();
			}
		}
	}

	private _update(title:string) {
		console.debug("Updating hypar code.");
		this._panel.title = title;
		this._panel.webview.html = this._getHtmlForWebview(title);
	}

	private _getHtmlForWebview(title:string) {
		// Local path to main script run in the webview
		const threejsPathOnDisk = vscode.Uri.file(
			path.join(this._extensionPath, 'media', 'three.js')
		);

		const orbitControlsPath = vscode.Uri.file(
			path.join(this._extensionPath, 'media', 'OrbitControls.js')
		);

		const gltfLoaderPath = vscode.Uri.file(
			path.join(this._extensionPath, 'media', 'GLTFLoader.js')
		);

		const hyparViewPath = vscode.Uri.file(
			path.join(this._extensionPath, 'media', 'hypar-view.js')
		);

		const hyparCssPath = vscode.Uri.file(
			path.join(this._extensionPath, 'media', 'hypar.css')
		);
		
		console.debug("Setting model path to the media directory.");
		let modelPath = vscode.Uri.file(
			path.join(this._extensionPath, 'media', 'model.glb')
		);
		if(vscode.workspace.workspaceFolders) {
			console.debug("Loading model.glb from workspace root.");
			modelPath = vscode.Uri.file(
				path.join(vscode.workspace.workspaceFolders[0].uri.fsPath, 'model.glb')
			);
		}
		
		const threejsUri = threejsPathOnDisk.with({ scheme: 'vscode-resource' });
		const orbitControlsUri = orbitControlsPath.with({scheme: 'vscode-resource'});
		const hyparViewUri = hyparViewPath.with({scheme: 'vscode-resource'});
		const gltfLoaderUri = gltfLoaderPath.with({scheme: 'vscode-resource'});
		const hyparCssUri = hyparCssPath.with({scheme: 'vscode-resource'});
		const modelUri = modelPath.with({scheme: 'vscode-resource'});

		// Use a nonce to whitelist which scripts can be run
		const nonce = getNonce();
		
		// Read the inputs from the hypar.json
		let inputPath = path.join(this._extensionPath, 'media', 'hypar.json');
		if(vscode.workspace.workspaceFolders) {
			inputPath = path.join(vscode.workspace.workspaceFolders[0].uri.fsPath, 'hypar.json');
		}
		let inputDivs = "";
		if(fs.existsSync(inputPath)) {
			const hypar = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
			for(let i=0; i<hypar.inputs.length; i++)
			{
				let input = hypar.inputs[i];
				if(input.type == 'range')
				{
					let inputDiv = `<p>${input.name}</p><input type="range" id="${input.name}" name="${input.name}" min="${input.min}" max="${input.max}" step="${input.step}"/>`;
					inputDivs += inputDiv;
					this._inputs[input.name] = Number.parseFloat(input.min);
				}
			}
		}

		return `<!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <!--
                Use a content security policy to only allow loading images from https or from our extension directory,
                and only allow scripts that have a specific nonce.
                -->
                <meta
					http-equiv="Content-Security-Policy"
					content="default-src 'none'; img-src vscode-resource: https:; script-src vscode-resource: 'nonce-${nonce}'; style-src vscode-resource:; connect-src vscode-resource:;"
				/>
				<meta name="viewport" content="width=device-width, initial-scale=1.0">
				<script nonce=${nonce} src="${threejsUri}"></script>
				<script nonce=${nonce} src="${orbitControlsUri}"></script>
				<script nonce=${nonce} src="${gltfLoaderUri}"></script>
				<link rel="stylesheet" type="text/css" href="${hyparCssUri}">
				<title>"${title}"</title>
            </head>
			<body>
				<div id="model"></div>
				<script type="module" nonce=${nonce}>
					import {init, loadModel} from "${hyparViewUri}";
					init("${modelUri}");
					loadModel();
				</script>
				<div class="data">
					<div id="inputs">
						${inputDivs}
					</div>
					<div id="outputs">
					</div>
				</div>
            </body>
            </html>`;
	}
}

function getNonce() {
	let text = '';
	const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	for (let i = 0; i < 32; i++) {
		text += possible.charAt(Math.floor(Math.random() * possible.length));
	}
	return text;
}