import { useEffect, useState } from "react";

export default function useGetResources(url, defaultState = {}) {
    const [resource, setResource] = useState(defaultState);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        setLoading(true);
        const abortController = new AbortController();

        fetch(url, { signal: abortController.signal })
            .then(res => res.json())
            .then(data => {

                setResource(Object.entries(data).reduce((acc, [key, value]) => {
                    typeof value === 'object' 
                    ? acc.push(value)
                    : acc[key] = value;
                    return acc;
                }, defaultState));

                setLoading(false);
            });
        return () => {
            abortController.abort;
        }
    }, [url]);

    return [loading, resource];
}