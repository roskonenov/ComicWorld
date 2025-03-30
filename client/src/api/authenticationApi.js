import useCreateResources from "../hooks/useCreateResources";
import { useEffect, useRef } from "react";

const baseUrl = 'http://localhost:3030/users';

export function useLogin() {
    const { fetchResource, loading } = useCreateResources();
    const abortRef = useRef(new AbortController());

    async function login(email, password) {
        return fetchResource(
            'POST',
            `${baseUrl}/login`,
            { email, password },
            { signal: abortRef.current.signal }
        );
    }

    useEffect(() => {
        const abortController = abortRef.current;
       
        return () => abortController.abort();
    }, []);

    return { login, loading };
}