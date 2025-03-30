import { useCallback, useState } from "react";

export default function useGetResources() {
    const [loading, setLoading] = useState(false);

    const fetchResource = useCallback(async (url, options = {}) => {
        setLoading(true);

        options = {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            },
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
    }, []);

    return { fetchResource, loading };
}