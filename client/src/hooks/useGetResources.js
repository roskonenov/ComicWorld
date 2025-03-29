import { useEffect, useState } from "react";

export default function useGetResources(url) {
    const [resource, setResource] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const abortController = new AbortController();

        fetch(url, { signal: abortController.signal })
            .then(res => res.json())
            .then(data => {
                setResource(data);
                setLoading(false);
            });
        return () => {
            abortController.abort();
        }
    }, [url]);

    return [loading, resource];
}