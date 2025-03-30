import useGetResources from "../hooks/useGetResources";
import useCreateResources from "../hooks/useCreateResources";
import { useContext, useEffect, useRef } from "react";
import { UserContext } from "../contexts/UserContext";

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
            { username, email, password },
            { signal: abortRef.current.signal }
        );
    }
    return { register, loading };
}

export function useLogout() {
    const { fetchResource, loading } = useGetResources();
    const abortRef = useRef(new AbortController());
    const { accessToken, userLogoutHandler } = useContext(UserContext);

    useEffect(() => {
        const abortController = abortRef.current;

        const options = {
            headers: {
                'X-Authorization': accessToken,
            },
        };

        fetchResource(`${baseUrl}/logout`, options)
            .then(userLogoutHandler);

        return () => abortController.abort();
    }, [accessToken, userLogoutHandler]);
    
    return { isLogout: !!accessToken, loading };
}