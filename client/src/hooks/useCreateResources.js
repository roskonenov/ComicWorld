import { useState } from "react";

export default function useCreateResources() {
    const [resource, setResource] = useState({});
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    async function fetchResource(method, url, data = null, options = {}) {
        setLoading(true);
        setError(null);

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

        await fetch(url, { ...options, signal })
            .then(res => {
                if (!res.ok) {
                    throw new Error(res.status);
                }
                return res.json()
            })
            .then(setResource)
            .catch(error => setError(error))
            .finally(setLoading(false));
    }
    return { fetchResource, resource, loading, error };
}