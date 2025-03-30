import { useCallback, useState } from "react";

export default function useGetResources() {
    const [resource, setResource] = useState([]);
    const [loading, setLoading] = useState(false);

    const fetchResource = useCallback((url) => {
        const abortController = new AbortController();
        setLoading(true);

        fetch(url, { signal: abortController.signal })
            .then(res => res.json())
            .then(data => {
                setResource(data);
                setLoading(false);
            });
        return () => {
            abortController.abort();
        };
    }, []);
    console.log(resource);

    return { resource, loading, fetchResource };
}