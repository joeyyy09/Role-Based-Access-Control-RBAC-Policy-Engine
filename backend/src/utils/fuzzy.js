
import levenshtein from 'fast-levenshtein';

export const Fuzzy = {
    /**
     * Finds the closest match from a list of candidates.
     * @param {string} input - The user input (potentially typo'd).
     * @param {string[]} candidates - Valid options from schema.
     * @param {number} threshold - Max distance to consider a match (default 3).
     * @returns {string|null} - The suggested correction, or null.
     */
    suggest(input, candidates, threshold = 3) {
        if (!input || !candidates) return null;
        
        let bestMatch = null;
        let minDistance = Infinity;

        for (const candidate of candidates) {
            const distance = levenshtein.get(input.toLowerCase(), candidate.toLowerCase());
            if (distance < minDistance && distance <= threshold) {
                minDistance = distance;
                bestMatch = candidate;
            }
        }
        return bestMatch;
    }
};
