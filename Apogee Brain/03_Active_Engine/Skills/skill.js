'use strict';

/**
 * Minimal Skill abstraction.
 *
 * A Skill is a plain, declarative description of how an existing set of
 * capability functions should be orchestrated to answer a class of request.
 * It intentionally implements no business logic of its own: it only
 * references and sequences pre-existing capability functions that live
 * elsewhere in the codebase (e.g. `apogee_core.js`,
 * `evidence_classification_rules.js`).
 *
 * This is deliberately NOT a plugin marketplace, agent framework, workflow
 * engine, or dependency-injection container. There is no registry, no
 * discovery, and no lifecycle beyond calling `matches` and `run`.
 */
function createSkill({ id, description, capabilities, matches, run }) {
    if (typeof id !== 'string' || !id.trim()) {
        throw new TypeError('Skill requires a non-empty string id');
    }
    if (typeof description !== 'string' || !description.trim()) {
        throw new TypeError('Skill requires a non-empty string description');
    }
    if (!capabilities || typeof capabilities !== 'object' || Array.isArray(capabilities)) {
        throw new TypeError('Skill requires a capabilities object mapping capability names to referenced functions');
    }
    for (const [capabilityName, capabilityFn] of Object.entries(capabilities)) {
        if (typeof capabilityFn !== 'function') {
            throw new TypeError(`Skill capability "${capabilityName}" must reference an existing function, not a reimplementation`);
        }
    }
    if (typeof matches !== 'function') {
        throw new TypeError('Skill requires a matches(transcript) function');
    }
    if (typeof run !== 'function') {
        throw new TypeError('Skill requires a run(transcript, context) function');
    }

    return Object.freeze({
        id,
        description,
        capabilities: Object.freeze({ ...capabilities }),
        matches,
        run
    });
}

module.exports = { createSkill };
