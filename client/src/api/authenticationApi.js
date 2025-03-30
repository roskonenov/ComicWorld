import useCreateResources from "../hooks/useCreateResources";
import { useEffect, useRef } from "react";

const baseUrl = 'http://localhost:3030/users';

export function useLogin() {
    const { fetchResource, loading } = useCreateResources();
    const abortRef = useRef(new AbortController());

    useEffect(() => {
        const abortController = abortRef.current;
       
        return () => abortController.abort();
    }, []);

    async function login(email, password) {
        return fetchResource(
            'POST',
            `${baseUrl}/login`,
            { email, password },
            { signal: abortRef.current.signal }
        );
    }
    return { login, loading };
}

export function useRegister() {
    const { fetchResource, loading } = useCreateResources();
    const abortRef = useRef(new AbortController());

    useEffect(() => {
        const abortController = abortRef.current;
       
        return () => abortController.abort();
    }, []);

    async function register(username, email, password) {
        return fetchResource(
            'POST',
            `${baseUrl}/register`,
            {username, email, password},
            {signal: abortRef.current.signal}
        );
    }
    return {register, loading};
}