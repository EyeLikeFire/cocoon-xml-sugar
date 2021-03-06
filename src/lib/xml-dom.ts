"use strict";

import XMLSugar from "./xml-sugar";

export default class XMLDOM {
	public static findNode(sugar: XMLSugar, filter: any): Element {
		const nodes = XMLDOM.getElements(sugar, filter);

		for (const node of nodes) {
			if (XMLDOM.matchesFilter(sugar, node, filter)) {
				return node;
			}
		}

		if (filter.parent && filter.fallback) {
			delete filter.parent;
			return XMLDOM.findNode(sugar, filter);
		}
		return null;
	}

	public static findNodes(doc: XMLSugar, filter: any): Element[] {
		const nodes = XMLDOM.getElements(doc, filter);

		const result: Element[] = [];
		for (const node of nodes) {
			if (XMLDOM.matchesFilter(doc, node, filter)) {
				result.push(node);
			}
		}
		return result;
	}

	public static addNodeIndented(sugar: XMLSugar, node: Element, parent: Element) {
		parent.appendChild(sugar.doc.createTextNode("\n"));
		let p = parent.parentNode;
		do {
			parent.appendChild(sugar.doc.createTextNode("    "));
			p = p.parentNode;
		}
		while (!!p);

		parent.appendChild(node);
		node.setAttribute("xmlns", "");
		parent.appendChild(sugar.doc.createTextNode("\n"));
	}

	public static updateOrAddNode(sugar: XMLSugar, filter: any, data: any) {
		let found = XMLDOM.findNode(sugar, filter);
		if (!found) {
			const parent = XMLDOM.parentNodeForPlatform(sugar, filter.parent);
			found = sugar.doc.createElementNS(null, filter.tag);
			XMLDOM.addNodeIndented(sugar, found, parent);
		}

		if (typeof data.value !== "undefined") {
			found.textContent = data.value || "";
		}
		if (data.attributes) {
			for (const attr of data.attributes) {
				if (attr.value === null) {
					found.removeAttribute(attr.name);
				} else {
					found.setAttribute(attr.name, attr.value);
				}
			}
		}
	}

	public static removeNode(sugar: XMLSugar, filter: any) {
		const node = XMLDOM.findNode(sugar, filter);
		if (node && node.parentNode) {
			const parent = node.parentNode as Element;
			parent.removeChild(node);

			/*remove empty platform node*/
			if (parent.tagName === "platform" && parent.parentNode) {
				const children = parent.childNodes;
				for (const child of children) {
					if (child.nodeType !== 3) {
						return;
					}
				}
				parent.parentNode.removeChild(parent);
			}
		}
	}

	private static getElements(sugar: XMLSugar, filter: any) {
		return Array.prototype.slice.call(sugar.doc.getElementsByTagName(filter.tag || "*"));
	}

	private static matchesFilter(sugar: XMLSugar, node: Element, filter: any) {
		const parent = node.parentNode as Element;
		if (filter.parent) {
			if (parent.getAttribute && parent.getAttribute("name") !== filter.parent) {
				return false;
			}
		} else if (parent !== sugar.root) {
			return false;
		}

		/*double check to avoid namespace mismatches in getElementsById*/
		if (filter.tag && filter.tag !== node.tagName && filter.tag.indexOf("*") < 0) {
			return false;
		}

		if (filter.attributes) {
			for (const attr of filter.attributes) {
				if (node.getAttribute(attr.name) !== attr.value) {
					return false;
				}
			}
		}
		return true;
	}

	private static parentNodeForPlatform(sugar: XMLSugar, platform?: string): Element {
		if (!platform) {
			return sugar.root;
		}

		let platformNode = XMLDOM.findNode(sugar, {
			attributes: [
				{name: "name", value: platform},
			],
			tag: "platform",
		});

		if (!platformNode) {
			platformNode = sugar.doc.createElementNS(null, "platform");
			platformNode.setAttribute("name", platform);
			XMLDOM.addNodeIndented(sugar, platformNode, sugar.root);
		}

		return platformNode;
	}
}
