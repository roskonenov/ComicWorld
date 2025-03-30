import { useState } from "react";

export default function useCreateResources() {
    const [loading, setLoading] = useState(false);
    async function fetchResource(method, url, data, options = {}) {
        setLoading(true);

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
        };
        
        const response = await fetch(url, options);

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