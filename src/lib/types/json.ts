// JSON value types
export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonArray;
export type JsonObject = { [key: string]: JsonValue };
export type JsonArray = JsonValue[];

// Node item types for the graph visualization
export interface NodeItem {
	key: string;
	value: string; // Always string for display (converted from JsonValue)
	type: 'string' | 'number' | 'boolean' | 'null' | 'reference' | 'undefined' | 'key';
	path?: string;
	targetNodeId?: string;
	isReferenceExpanded?: boolean;
}

// Structure tracking types
export interface JsonStructure {
	_type?: 'array' | 'object';
	_length?: number;
	_sample?: JsonStructure | string | null;
	[key: string]: JsonStructure | string | number | null | undefined;
}
