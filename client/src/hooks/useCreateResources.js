import { useEffect, useState } from "react";

export default function useCreateResources(method, url, data, options = {}) {
    const [resource, setResource] = useState([]);
    const [pending, setPending] = useState(true);

    useEffect(() => {

        setPending(true);
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

        fetch(url, {...options, signal })
            .then(res => res.json())
            .then(data => {
                setResource(data);
                setPending(false);
            });
        return () => {
            abortController.abort();
        }
    }, [url]);

    return [pending, resource];
}