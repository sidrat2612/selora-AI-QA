export const CANONICAL_SCHEMA_VERSION = 1;

export const CANONICAL_ACTION_TYPES = ['navigate', 'click', 'fill', 'assert', 'wait', 'unknown'] as const;

export type CanonicalActionType = (typeof CANONICAL_ACTION_TYPES)[number];

export type CanonicalSourceLocation = {
	line: number;
	column?: number;
};

export type CanonicalAction = {
	id: string;
	type: CanonicalActionType;
	label: string;
	target?: string;
	value?: string;
	assertion?: string;
	source: CanonicalSourceLocation;
};

export type CanonicalStep = {
	id: string;
	label: string;
	actionIds: string[];
};

export type CanonicalTestDefinition = {
	schemaVersion: typeof CANONICAL_SCHEMA_VERSION;
	sourceType: 'playwright_codegen_ts';
	name: string;
	description?: string;
	tags: string[];
	recording: {
		filename: string;
		checksum: string;
	};
	steps: CanonicalStep[];
	actions: CanonicalAction[];
	metadata: {
		inferenceMode: 'llm' | 'heuristic';
		promptVersion: string;
		model?: string;
		redactionCount: number;
	};
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

function isStringArray(value: unknown): value is string[] {
	return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

export function validateCanonicalTestDefinition(input: unknown): CanonicalTestDefinition {
	if (!isRecord(input)) {
		throw new Error('Canonical definition must be an object.');
	}

	if (input['schemaVersion'] !== CANONICAL_SCHEMA_VERSION) {
		throw new Error(`Canonical definition must use schema version ${CANONICAL_SCHEMA_VERSION}.`);
	}

	if (input['sourceType'] !== 'playwright_codegen_ts') {
		throw new Error('Canonical definition sourceType must be playwright_codegen_ts.');
	}

	if (typeof input['name'] !== 'string' || input['name'].trim().length === 0) {
		throw new Error('Canonical definition name is required.');
	}

	if (!isStringArray(input['tags'])) {
		throw new Error('Canonical definition tags must be a string array.');
	}

	if (!isRecord(input['recording'])) {
		throw new Error('Canonical definition recording is required.');
	}

	if (typeof input['recording']['filename'] !== 'string') {
		throw new Error('Canonical definition recording.filename is required.');
	}

	if (typeof input['recording']['checksum'] !== 'string') {
		throw new Error('Canonical definition recording.checksum is required.');
	}

	if (!Array.isArray(input['steps'])) {
		throw new Error('Canonical definition steps must be an array.');
	}

	if (!Array.isArray(input['actions'])) {
		throw new Error('Canonical definition actions must be an array.');
	}

	for (const action of input['actions']) {
		if (!isRecord(action)) {
			throw new Error('Each canonical action must be an object.');
		}

		if (typeof action['id'] !== 'string' || typeof action['label'] !== 'string') {
			throw new Error('Each canonical action must have id and label.');
		}

		if (!CANONICAL_ACTION_TYPES.includes(action['type'] as CanonicalActionType)) {
			throw new Error(`Unsupported canonical action type: ${String(action['type'])}`);
		}

		if (!isRecord(action['source']) || typeof action['source']['line'] !== 'number') {
			throw new Error('Each canonical action must include a source line.');
		}
	}

	for (const step of input['steps']) {
		if (!isRecord(step)) {
			throw new Error('Each canonical step must be an object.');
		}

		if (typeof step['id'] !== 'string' || typeof step['label'] !== 'string') {
			throw new Error('Each canonical step must have id and label.');
		}

		if (!isStringArray(step['actionIds'])) {
			throw new Error('Each canonical step must provide actionIds.');
		}
	}

	if (!isRecord(input['metadata'])) {
		throw new Error('Canonical definition metadata is required.');
	}

	if (input['metadata']['inferenceMode'] !== 'llm' && input['metadata']['inferenceMode'] !== 'heuristic') {
		throw new Error('Canonical definition metadata.inferenceMode must be llm or heuristic.');
	}

	if (typeof input['metadata']['promptVersion'] !== 'string') {
		throw new Error('Canonical definition metadata.promptVersion is required.');
	}

	if (typeof input['metadata']['redactionCount'] !== 'number') {
		throw new Error('Canonical definition metadata.redactionCount is required.');
	}

	return input as CanonicalTestDefinition;
}
