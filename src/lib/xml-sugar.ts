"use strict";

import * as detectNode from "detect-node";
import * as xmldom from "xmldom";

import {canvasplusPlugins} from "./constants/c-canvasplus-plugins";
import {webviewplusPlugins} from "./constants/c-webviewplus-plugins";
import {BundleIdAlias} from "./enums/e-bundle-id-alias";
import {Environment} from "./enums/e-environment";
import {Orientation} from "./enums/e-orientation";
import {Platform} from "./enums/e-platform";
import {VersionCodeAlias} from "./enums/e-version-code-alias";
import Utils from "./utils";
import XMLDOM from "./xml-dom";

export default class XMLSugar {
	private static encode(str: string): string {
		if (!str) {
			return str;
		}
		return str.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/"/g, "&apos;");
	}

	private static decode(str: string): string {
		if (!str) {
			return str;
		}
		return str.replace(/&apos;/g, "\"")
		.replace(/&quot;/g, "")
		.replace(/&gt;/g, ">")
		.replace(/&lt;/g, "<")
		.replace(/&amp;/g, "&");
	}

	/**
	 * Replaces every Cocoon specific XML tag and parameter name with the ones from Cordova.
	 * @param doc configuration of a Cocoon or Cordova project.
	 * @returns {Document} the same configuration using only Cordova tags.
	 */
	private static replaceOldSyntax(doc: Document): Document {
		let newDoc: Document = XMLSugar.replaceOldPlatformSyntax(doc);
		newDoc = XMLSugar.replaceOldPluginSyntax(newDoc);
		newDoc = XMLSugar.replaceErrors(newDoc);

		return newDoc;
	}

	/**
	 * Replaces every Cocoon specific XML tag and parameter name related with platforms with the ones from Cordova.
	 * @param doc configuration of a Cocoon or Cordova project.
	 * @returns {Document} the same configuration using only Cordova tags.
	 */
	private static replaceOldPlatformSyntax(doc: Document): Document {
		const platforms = Array.prototype.slice.call(doc.getElementsByTagNameNS(cocoonNS, "platform"));

		for (const platform of platforms) {
			const platformEle: Element = doc.createElementNS(null, "platform");
			platformEle.setAttribute("name", platform.getAttribute("name"));
			if (platform.getAttribute("version")) {
				const engine: Element = doc.createElementNS(null, "engine");
				engine.setAttribute("name", platform.getAttribute("name"));
				engine.setAttribute("spec", platform.getAttribute("version"));
				platform.parentNode.insertBefore(engine, platform);
			}

			const children = platform.childNodes;
			for (const child of children) {
				if (child.nodeType === 1) {
					platformEle.appendChild(child);
				}
			}

			if (platform.getAttribute("enabled")) {
				const preference: Element = doc.createElementNS(null, "preference");
				preference.setAttribute("name", "enabled");
				preference.setAttribute("value", platform.getAttribute("enabled"));
				platformEle.appendChild(preference);
			}

			platform.parentNode.insertBefore(platformEle, platform);
			platform.parentNode.removeChild(platform);
		}

		return doc;
	}

	/**
	 * Replaces every Cocoon specific XML tag and parameter name related with plugins with the ones from Cordova.
	 * @param doc configuration of a Cocoon or Cordova project.
	 * @returns {Document} the same configuration using only Cordova tags.
	 */
	private static replaceOldPluginSyntax(doc: Document): Document {
		const plugins = Array.prototype.slice.call(doc.getElementsByTagNameNS(cocoonNS, "plugin"));

		for (const plugin of plugins) {
			const pluginEle = doc.createElementNS(null, "plugin");
			pluginEle.setAttribute("name", plugin.getAttribute("name"));
			if (Utils.isValidGit(plugin.getAttribute("name"))) {
				pluginEle.setAttribute("spec", plugin.getAttribute("name"));
			} else if (plugin.getAttribute("version")) {
				pluginEle.setAttribute("spec", plugin.getAttribute("version"));
			}

			const children = plugin.childNodes;
			for (const child of children) {
				if (child.nodeType === 1 && child.nodeName.toUpperCase() === "PARAM") {
					const variable: Element = doc.createElementNS(null, "variable");
					variable.setAttribute("name", (child as Element).getAttribute("name")); // nodeType === 1 implies it's an Element
					variable.setAttribute("value", (child as Element).getAttribute("value"));
					pluginEle.appendChild(variable);
				} else if (child.nodeType === 1) {
					pluginEle.appendChild(child);
				}
			}

			plugin.parentNode.insertBefore(pluginEle, plugin);
			plugin.parentNode.removeChild(plugin);
		}

		return doc;
	}

	/**
	 * Fixes every custom plugin where the attribute name is the url where the plugin is located and the attribute spec
	 * is not by setting the spec with the value of the name.
	 * @param doc configuration of a Cocoon or Cordova project.
	 * @returns {Document} the same configuration using only Cordova tags.
	 */
	private static replaceErrors(doc: Document): Document {
		const plugins = Array.prototype.slice.call(doc.getElementsByTagName("plugin"));

		for (const plugin of plugins) {
			if (Utils.isValidGit(plugin.getAttribute("name")) &&
				plugin.getAttribute("name") !== plugin.getAttribute("spec")) {
				plugin.setAttribute("spec", plugin.getAttribute("name"));
			}
		}
		return doc;
	}

	public doc: XMLDocument;
	public root: Element;
	private serializer: XMLSerializer;

	constructor(text: string) {
		let parser: DOMParser;
		if (!detectNode) { // We are on a full browser
			parser = new DOMParser();
			this.serializer = new XMLSerializer();
		} else { // We are on NodeJS
			parser = new xmldom.DOMParser();
			this.serializer = new xmldom.XMLSerializer();
		}

		this.doc = XMLSugar.replaceOldSyntax(parser.parseFromString(text, "text/xml"));
		const root = this.doc.getElementsByTagName("widget")[0];
		if (root && !root.getAttributeNS(xmlnsNS, "cdv")) {
			root.setAttributeNS(xmlnsNS, "xmlns:cdv", cordovaNS);
		}
		this.root = root;
	}

	/**
	 * Returns the XMLin a String format.
	 * @returns {string} The XML file content
	 */
	public xml(): string {
		let xml = this.serializer.serializeToString(this.doc);
		xml = xml.replace(/[ ]xmlns[=]["]["]/g, ""); // remove empty xml
		return Utils.formatXml(xml);
	}

	/**
	 * Checks if there is a parse error with the XML.
	 * @returns {boolean} If there is a parse error.
	 */
	public isErred(): boolean {
		//noinspection SpellCheckingInspection
		return this.doc.getElementsByTagName("parsererror").length > 0 || !this.root;
	}

	/**
	 * Gets the name of the project.
	 * @returns {string}
	 */
	public getName(): string {
		return this.getNodeValue("name");
	}

	/**
	 * Sets the name of the project.
	 * @param value Name to set.
	 */
	public setName(value: string) {
		this.setNodeValue("name", value);
	}

	/**
	 * Gets the description of the project.
	 * @returns {string}
	 */
	public getDescription(): string {
		return this.getNodeValue("description");
	}

	/**
	 * Sets the description of the project.
	 * @param value Description to set.
	 */
	public setDescription(value: string) {
		this.setNodeValue("description", value);
	}

	/**
	 * Gets the author's name of the project.
	 * @returns {string}
	 */
	public getAuthorName(): string {
		return this.getNodeValue("author");
	}

	/**
	 * Sets the author's name of the project.
	 * @param value Author's name to set.
	 */
	public setAuthorName(value: string) {
		this.setNodeValue("author", value);
	}

	/**
	 * Gets the author's email of the project.
	 * @returns {string}
	 */
	public getAuthorEmail(): string {
		return this.getNode("author").getAttribute("email");
	}

	/**
	 * Sets the author's email of the project.
	 * @param value Author's email to set.
	 */
	public setAuthorEmail(value: string) {
		this.getNode("author").setAttribute("email", value);
	}

	/**
	 * Gets the author's URL of the project.
	 * @returns {string}
	 */
	public getAuthorURL(): string {
		return this.getNode("author").getAttribute("href");
	}

	/**
	 * Sets the author's URL of the project.
	 * @param value Author's URL to set.
	 */
	public setAuthorURL(value: string) {
		this.getNode("author").setAttribute("href", value);
	}

	/**
	 * Gets the bundle ID of the project.
	 * @param platform Name of the platform the bundle ID affects to.
	 * Don't set to retrieve the general bundle ID.
	 * @param fallback If you want to retrieve the general bundle ID in case there is no specific for the platform.
	 * @returns {string}
	 */
	public getBundleId(platform?: Platform, fallback: boolean = true): string {
		if (platform) {
			const name = BundleIdAlias[platform];
			const value = this.root.getAttribute(name);
			if (value) {
				return value;
			} else if (!fallback) {
				return "";
			}
		}
		return this.root.getAttribute("id");
	}

	/**
	 * Sets the bundle ID of the project.
	 * @param value Bundle ID to set.
	 * @param platform Name of the platform this bundle ID will affect to. Don't set to affect all o them.
	 */
	public setBundleId(value: string, platform?: Platform) {
		if (platform) {
			const name = BundleIdAlias[platform];
			if (name) {
				if (value) {
					this.root.setAttribute(name, value);
				} else {
					this.root.removeAttribute(name);
				}
			} else {
				console.error("This feature is not currently supported for the " + platform + " platform.");
			}
		} else {
			this.root.setAttribute("id", value);
		}
	}

	/**
	 * Gets the version number of the project.
	 * @param platform Name of the platform the version number affects to.
	 * Don't set to retrieve the general version version number.
	 * @param fallback If you want to retrieve the general version number in case there is no specific for the platform.
	 * @returns {string}
	 */
	public getVersion(platform?: Platform, fallback: boolean = true): string {
		if (platform) {
			const version = this.root.getAttribute(platform + "-version");
			if (version) {
				return version;
			} else if (fallback) {
				this.getVersion(null);
			} else {
				return "";
			}
		}

		return this.root.getAttribute("version");
	}

	/**
	 * Sets the version number of the project.
	 * @param value Version number to set.
	 * @param platform Name of the platform this version number will affect to. Don't set to affect all o them.
	 */
	public setVersion(value: string, platform?: Platform) {
		if (platform) {
			const name = platform + "-version";
			if (name) {
				if (value) {
					this.root.setAttribute(name, value);
				} else {
					this.root.removeAttribute(name);
				}
				return;
			}
		}
		return this.root.setAttribute("version", value);
	}

	/**
	 * Gets the version code of the project.
	 * @param platform Name of the platform the version code affects to.
	 * Don't set to retrieve the general version code.
	 * @param fallback If you want to retrieve the general version code in case there is no specific for the platform.
	 * @returns {string}
	 */
	public getVersionCode(platform?: Platform, fallback: boolean = true): string {
		if (platform) {
			const name = VersionCodeAlias[platform];
			if (name) {
				const version = this.root.getAttribute(name);
				if (version) {
					return version;
				} else if (!fallback || platform === Platform.Android) {
					return ""; // android versionCode is a number, not a mayor.minor version name
				} else {
					this.getVersion(platform);
				}
			} else {
				return "";
			}
		}

		return this.root.getAttribute("version");
	}

	/**
	 * Sets the version code of the project.
	 * @param value Version code to set.
	 * @param platform Name of the platform this version code will affect to. Don't set to affect all o them.
	 */
	public setVersionCode(value: string, platform?: Platform) {
		if (platform) {
			const name = VersionCodeAlias[platform];
			if (name) {
				if (value) {
					this.root.setAttribute(name, value);
				} else {
					this.root.removeAttribute(name);
				}
				return;
			} else {
				console.error("This feature is not currently supported for the " + platform + " platform.");
			}
		}
		return this.root.setAttribute("version", value);
	}

	/**
	 * Gets the Cocoon version that will be used to compile the project.
	 * @returns {string} The Cocoon version.
	 */
	public getCocoonVersion(): string {
		return this.getPreference("cocoon-version") || "latest";
	}

	/**
	 * Sets the Cocoon version that will be used to compile the project.
	 * @param version The Cocoon version.
	 */
	public setCocoonVersion(version: string) {
		this.setPreference("cocoon-version", version);
	}

	/**
	 * Gets the content URL of the project.
	 * @param pPlatform Name of the platform the content URL affects to.
	 * Don't set to retrieve the general content URL.
	 * @param pFallback If you want to retrieve the general content URL in case there is no specific for the platform.
	 * @returns {string}
	 */
	public getContentURL(pPlatform?: Platform, pFallback: boolean = true): string {
		const filter = {
			fallback: pFallback,
			parent: pPlatform,
			tag: "content",
		};
		const node = XMLDOM.findNode(this, filter);
		return node ? node.getAttribute("src") : "";
	}

	/**
	 * Sets the content URL of the project.
	 * @param pValue Content URL to set.
	 * @param pPlatform Name of the platform this content URL will affect to. Don't set to affect all o them.
	 */
	public setContentURL(pValue: string, pPlatform?: Platform) {
		const filter = {
			parent: pPlatform,
			tag: "content",
		};
		if (pValue) {
			const update = {
				attributes: [
					{name: "src", value: pValue},
				],
			};
			XMLDOM.updateOrAddNode(this, filter, update);
		} else {
			XMLDOM.removeNode(this, filter);
		}
	}

	/**
	 * Gets the orientation of the project.
	 * @param platform Name of the platform the orientation affects to. Don't set to retrieve the general orientation.
	 * @param fallback If you want to retrieve the general orientation in case there is no specific for the platform.
	 * @returns {Orientation}
	 */
	public getOrientation(platform?: Platform, fallback: boolean = true): Orientation {
		const value = this.getPreference("Orientation", platform, fallback);
		if (!value) {
			return Orientation.SYSTEM_DEFAULT;
		} else if (value === "portrait") {
			return Orientation.PORTRAIT;
		} else if (value === "landscape") {
			return Orientation.LANDSCAPE;
		} else {
			return Orientation.BOTH;
		}
	}

	/**
	 * Sets the orientation of the project.
	 * @param value Orientation to set.
	 * @param platform Name of the platform this orientation will affect to. Don't set to affect all o them.
	 */
	public setOrientation(value: Orientation, platform?: Platform) {
		this.setPreference("Orientation", value as any, platform);
	}

	/**
	 * Checks if the project is set to compile into fullscreen mode.
	 * @param platform Name of the platform the configuration affects to.
	 * Don't set to retrieve the general configuration.
	 * @param fallback If you want to retrieve the general configuration in case there is no specific for the platform.
	 * @returns {boolean}
	 */
	public isFullScreen(platform?: Platform, fallback: boolean = true): boolean {
		const value = this.getPreference("Fullscreen", platform, fallback);
		return value ? value !== "false" : false;
	}

	/**
	 * Sets if the project is set to compile into fullscreen mode.
	 * @param value If you want the project to compile into fullscreen mode.
	 * @param platform Name of the platform this configuration will affect to. Don't set to affect all o them.
	 */
	public setFullScreen(value: boolean, platform?: Platform) {
		this.setPreference("Fullscreen", value === null ? null : value.toString(), platform);
	}

	/**
	 * Gets the XML node of the platform specified.
	 * @param platform Name of the platform.
	 * @returns {string} The node of the platform specified.
	 */
	public getCocoonPlatform(platform: Platform): Element {
		const filter = {
			attributes: [
				{name: "name", value: platform},
			],
			tag: "platform",
		};
		return XMLDOM.findNode(this, filter);
	}

	/**
	 * Returns a boolean indicating if a project with this XML will be compiled for the specified platform.
	 * @param platform Name of the platform.
	 * @returns {boolean} If the platform is enabled.
	 */
	public isCocoonPlatformEnabled(platform: Platform): boolean {
		const preference = this.getPreference("enabled", platform);
		return preference !== null && preference !== "false";
	}

	/**
	 * Sets if a project with this XML will be compiled for the specified platform.
	 * @param platform Name of the platform.
	 * @param enabled If the platform should be enabled.
	 */
	public setCocoonPlatformEnabled(platform: Platform, enabled: boolean) {
		this.setPreference("enabled", enabled ? "true" : "false", platform);
	}

	/**
	 * Gets the XML node of the engine specified.
	 * @param platform Name of the platform.
	 * @returns {string} The engine node of the platform specified.
	 */
	public getCocoonEngine(platform: Platform): Element {
		const filter = {
			attributes: [
				{name: "name", value: platform},
			],
			tag: "engine",
		};
		return XMLDOM.findNode(this, filter);
	}

	/**
	 * Gets the semantic version of the engine for the platform specified that will be required in a compilation of a
	 * project with this XML.
	 * @param platform Name of the platform.
	 * @returns {string} The SemVer of the engine for the platform specified.
	 */
	public getCocoonEngineSpec(platform: Platform): string {
		const node = this.getCocoonEngine(platform);
		return node ? node.getAttribute("spec") : null;
	}

	/**
	 * Sets the semantic version of the engine for the platform specified that will be required in a compilation of a
	 * project with this XML.
	 * @param platform Name of the platform.
	 * @param spec SemVer of the version.
	 */
	public setCocoonEngineSpec(platform: Platform, spec: string = "*") {
		const filter = {
			attributes: [
				{name: "name", value: platform},
			],
			tag: "engine",
		};
		const update = {
			attributes: [
				{name: "name", value: platform},
				{name: "spec", value: spec},
			],
		};
		XMLDOM.updateOrAddNode(this, filter, update);
	}

	/**
	 * Gets the value of the preference of the project.
	 * @param name Name of the preference to get the value from.
	 * @param pPlatform Name of the platform the preference affects to.
	 * @param pFallback If you want to retrieve the general value in case there is no specific for the platform.
	 * @returns {string}
	 */
	public getPreference(name: string, pPlatform?: Platform, pFallback: boolean = true): string {
		const filter = {
			attributes: [
				{name: "name", value: name},
			],
			fallback: pFallback,
			parent: pPlatform,
			tag: "preference",
		};
		const node = XMLDOM.findNode(this, filter);
		return node ? node.getAttribute("value") : null;
	}

	/**
	 * Sets the value of the preference of the project.
	 * @param name Name of the preference to set the value.
	 * @param pValue Value of the preference.
	 * @param pPlatform Name of the platform the preference affects to.
	 */
	public setPreference(name: string, pValue: string, pPlatform?: Platform) {
		const filter = {
			attributes: [
				{name: "name", value: name},
			],
			parent: pPlatform,
			tag: "preference",
		};

		if (pValue) {
			const update = {
				attributes: [
					{name: "name", value: name},
					{name: "value", value: pValue},
				],
			};
			XMLDOM.updateOrAddNode(this, filter, update);
		} else {
			XMLDOM.removeNode(this, filter);
		}
	}

	/**
	 * Gets the environment, that is the webview, of the project.
	 * @param platform Name of the platform the environment affects to. Don't set to retrieve the general environment.
	 * @returns {Environment}
	 */
	public getEnvironment(platform?: Platform): Environment {
		if (!platform) {
			const environments = [this.getEnvironment(Platform.IOS), this.getEnvironment(Platform.Android)];
			for (let j = 1; j < environments.length; ++j) {
				if (environments[j] !== environments[j - 1]) {
					// conflict: different environments per platform
					return Environment.WEBVIEW;
				}
			}

			return environments[0];
		}

		const environmentsPlugins: any[] = [canvasplusPlugins, webviewplusPlugins];

		let env = Environment.WEBVIEW;
		for (const environmentPlugins of environmentsPlugins) {
			const platformEnvironmentPlugin = environmentPlugins[platform];
			if (platformEnvironmentPlugin) {
				const pluginElement = this.findPlugin(platformEnvironmentPlugin.plugin);
				if (pluginElement) {
					env = environmentPlugins.value;
				}
			}
		}
		return env;
	}

	/**
	 * Sets the environment, that is the webview, of the project.
	 * @param value Environment to set.
	 * @param platform Name of the platform this environment will affect to. Don't set to affect all o them.
	 */
	public setEnvironment(value: Environment, platform?: Platform) {
		const names = platform ? [platform] : ["android", "ios"];

		for (const name of names) {
			let info: any;
			if (value === Environment.CANVAS_PLUS) {
				info = canvasplusPlugins[name];
				if (info) {
					this.addPlugin(info.plugin);
					this.removePlugin(webviewplusPlugins[name].plugin);
				}
			} else if (value === Environment.WEBVIEW_PLUS) {
				info = webviewplusPlugins[name];
				if (info) {
					this.addPlugin(info.plugin);
					this.removePlugin(canvasplusPlugins[name].plugin);
				}
			} else {
				const infos = [canvasplusPlugins, webviewplusPlugins];
				for (const auxInfo of infos) {
					info = auxInfo[name];
					if (!info) {
						continue;
					}
					this.removePlugin(info.plugin);
				}
			}
		}
	}

	/**
	 * Looks for a plugin in the project with the given name.
	 * @param name Name of the plugin to look for.
	 * @returns {Element} The plugin with the given name in the project.
	 */
	public findPlugin(name: string): Element {
		const filter = {
			attributes: [
				{name: "name", value: name},
			],
			tag: "plugin",
		};
		return XMLDOM.findNode(this, filter);
	}

	/**
	 * Finds every plugin in the project.
	 * @returns {Element} Every plugin in the project.
	 */
	public findAllPlugins(): Element[] {
		const filter = {
			tag: "plugin",
		};
		return XMLDOM.findNodes(this, filter);
	}

	/**
	 *
	 * @param pluginName Name of the plugin.
	 * @param varName Name of the variable.
	 * @returns {string} Value of the variable in the specified plugin.
	 */
	public findPluginVariable(pluginName: string, varName: string): string {
		const plugin = this.findPlugin(pluginName);
		let result: string;
		if (plugin) {
			const nodes = Array.prototype.slice.call(plugin.childNodes);
			for (const node of nodes) {
				if (node.nodeType === 1 && (node as Element).getAttribute("name") === varName) {
					result = XMLSugar.decode((node as Element).getAttribute("value")) || ""; // nodeType === 1 implies it's an Element
					break;
				}
			}
		}
		return result;
	}

	/**
	 * Adds a plugin to the project.
	 * @param name Name of the plugin to add.
	 * @param spec Version of the plugin to add. Leave empty to get the latest version.
	 */
	public addPlugin(name: string, spec: string = "*") {
		if (Utils.isValidUrl(name) && name.indexOf(".git") !== -1 && name !== spec) {
			spec = name;
		}
		const filter = {
			attributes: [
				{name: "name", value: name},
			],
			tag: "plugin",
		};
		const update = {
			attributes: [
				{name: "name", value: name},
				{name: "spec", value: spec},
			],
		};
		XMLDOM.updateOrAddNode(this, filter, update);
	}

	/**
	 * Removes a plugin from the project.
	 * @param name Name of the plugin to remove.
	 */
	public removePlugin(name: string) {
		const filter = {
			attributes: [
				{name: "name", value: name},
			],
			tag: "plugin",
		};
		XMLDOM.removeNode(this, filter);
	}

	/**
	 * Gets every variable in the plugin with the given name.
	 * @param pluginName Name of the plugin.
	 * @returns {NodeListOf<Element>} List of the variables in the specified plugin. Null if the plugin doesn't exist.
	 */
	public getPluginVariables(pluginName: string): NodeListOf<Element> {
		const plugin = this.findPlugin(pluginName);
		return plugin ? plugin.getElementsByTagName("variable") : null;
	}

	/**
	 * Adds a variable to a plugin. If the plugin doesn't exist it will be added as well.
	 * @param pluginName Name of the plugin to add the variable to.
	 * @param varName Name of the variable.
	 * @param varValue Value for the variable.
	 */
	public addPluginVariable(pluginName: string, varName: string, varValue: string) {
		this.addPlugin(pluginName);
		const plugin = this.findPlugin(pluginName);
		if (plugin) {
			const nodes = Array.prototype.slice.call(plugin.childNodes);
			let node: Element;
			for (const auxNode of nodes) {
				if (auxNode.nodeType === 1 && (auxNode as Element).getAttribute("name") === varName) {
					node = (auxNode as Element); // nodeType === 1 implies it's an Element
					break;
				}
			}
			if (!node) {
				node = this.doc.createElementNS(null, "variable");
				node.setAttribute("name", varName || "");
				XMLDOM.addNodeIndented(this, node, plugin);
			}
			node.setAttribute("value", XMLSugar.encode(varValue) || "");
		}
	}

	/**
	 * Removes a variable from the plugin.
	 * @param pluginName Name of the plugin to remove the variable from.
	 * @param varName Name of the variable.
	 */
	public removePluginVariable(pluginName: string, varName: string) {
		const filter = {
			attributes: [
				{name: "name", value: varName},
			],
			parent: pluginName,
			tag: "variable",
		};
		XMLDOM.removeNode(this, filter);
	}

	/**
	 * Gets a node in the project XML.
	 * @param tagName Name of the node.
	 * @param pPlatform Parent platform of the node.
	 * @param pFallback If you want to try to retrieve a general node if the node wasn't found in the platform.
	 * @returns {Element} The XML node.
	 */
	public getNode(tagName: string, pPlatform?: Platform, pFallback: boolean = true): Element {
		return XMLDOM.findNode(this, {
			fallback: pFallback,
			parent: pPlatform,
			tag: tagName,
		});
	}

	/**
	 * Removes a node in the project XML.
	 * @param tagName Name of the node.
	 * @param pPlatform Parent platform of the node.
	 */
	public removeNode(tagName: string, pPlatform?: Platform) {
		XMLDOM.removeNode(this, {
			parent: pPlatform,
			tag: tagName,
		});
	}

	/**
	 * Gets the value of a node in the project XML.
	 * @param tagName Name of the node.
	 * @param platform Parent platform of the node.
	 * @param fallback If you want to try to retrieve it from a general node if the node wasn't found in the platform.
	 * @returns {Element} The XML node.
	 */
	public getNodeValue(tagName: string, platform?: Platform, fallback: boolean = true): string {
		const node = this.getNode(tagName, platform, fallback);
		return node ? node.textContent : null;
	}

	/**
	 * Sets the value of a node in the project XML. If the node doesn't exist it will be created.
	 * @param tagName Name of the node.
	 * @param pValue Value for the node.
	 * @param pPlatform Parent platform of the node.
	 * @returns {Element} The XML node.
	 */
	public setNodeValue(tagName: string, pValue: string, pPlatform?: Platform) {
		XMLDOM.updateOrAddNode(this, {
			parent: pPlatform,
			tag: tagName,
		}, {
			value: pValue,
		});
	}
}

const cocoonNS = "http://cocoon.io/ns/1.0";
const cordovaNS = "http://cordova.apache.org/ns/1.0";
const xmlnsNS = "http://www.w3.org/2000/xmlns/";
