Hypar Function Builder is a [Webview](https://code.visualstudio.com/api/extension-guides/webview) extension for VS Code, which works with the Hypar CLI to provide a live building and visualization environment for building your [Hypar](https://hypar.io/) functions.

## Prerequisites
- The Hypar CLI contains commands for generating, running, and publishing your Hypar function.
  - From your terminal (Mac and Linux) or command line (Windows): `dotnet tool install -g hypar.cli`
- The [C# for Visual Studio Code Extension](https://marketplace.visualstudio.com/items?itemName=ms-vscode.csharp). This is listed as a dependency of this extension and should be installed automatically when this extension is installed.
- A Hypar function. Hypar functions can be created from the command line using `hypar new`. This extension works on any Hypar function directory that contains a `hypar.json` file.

## To Use
- Create a Hypar function from the command line using `hypar new`. This will create a directory with the same name as the function.
- File > Open... > Select the directory you created in the first step, or an existing Hypar function directory (a directory with a `hypar.json` file).
- Run the `Hypar: Run` task. 
  - This will start the Hypar runner which watches for changes in the `.cs` files and `hypar.json` file. When changes occur, the runner automatically generates new code, builds the function, and executes the function with the inputs it finds in the `input.json` file. If no `input.json` file exists when the Hypar runner executes, a new `input.json` file will be generated with default values.
- Run the `Hypar: Preview` command. 
  - This will start the Hypar preview. The preview is a special mode of the Hypar web application which is embedded in a web view in Visual Studio Code.
- Update your code.
  - As you update your code, the Hypar runner will rebuild and re-execute. If execution is successful, the preview will update to show the new state of the model.
  - Re-execution will write results to an `output.json` file in the root of your workspace. This file contains the output values that you'll see in the UI.
- Update your `hypar.json`
  - Changing the inputs, outputs, or description of your `hypar.json` will cause the Function Builder's UI to update to show the new inputs and outputs. Actions like renaming inputs, or changing input types, will cause the build to fail, so although the UI may update, the model may not. Visit the VS Code terminal to see error messages for aid in debugging.
  - Updating the `hypar.json` will also cause the `README.md` file to be updated.
- Click the camera icon to grab a preview.
  - The preview image will be written to `preview.png` at the root of your workspace. The `README.md` file references this image. Capturing a new screen shot will also show the updated `preview.png` image in the `README.md`.

## Troubleshooting
- **ChromeOS:** if you see a blank screen after logging into Hypar, your GPU support may be disabled (although this could be indicative of other problems, instead). Go to [chrome://flags/#crostini-gpu-support](chrome://flags/#crostini-gpu-support) in a regular web browser, set the flag to 'Enabled', and restart. This flag is not supported on every Chromebook, but it will be enabled by default in later versions.
