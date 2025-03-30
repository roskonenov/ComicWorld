import { useState } from "react";

export default function useCreateResources() {
    const [loading, setLoading] = useState(false);

    async function fetchResource(method, url, data = null, options = {}) {
        setLoading(true);

        const abortController = new AbortController();
        const signal = abortController.signal;

        options.method = method;

        if (data) {
            options = {
                ...options,
                headers: {
                    'Content-Type': 'application/json',
                    ...options.headers
                },
                body: JSON.stringify(data),
            }
        }

        const response = await fetch(url, { ...options, signal });

        const responseContentType = response.headers.get('Content-Type');
        if (!responseContentType) {
            return;
        }

        if (!response.ok) {
            const result = await response.json();
            throw result;
        }

        const result = await response.json();
        setLoading(false);

        return result;
    }
    return { fetchResource, loading };
}