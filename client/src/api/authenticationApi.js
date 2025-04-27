import useGetResources from "../hooks/useGetResources";
import useCreateResources from "../hooks/useCreateResources";
import { useEffect, useRef } from "react";
import { useUserContext } from "../contexts/UserContext";
import { toast } from "react-toastify";

const baseUrl = `${import.meta.env.VITE_APP_SERVER_URL}/users`;

export function useLogin() {
    const { fetchResource, loading } = useCreateResources();
    const abortRef = useRef(new AbortController());

    useEffect(() => {
        const abortController = abortRef.current;

        return () => abortController.abort();
    }, []);

    async function login(email, password) {
        return await fetchResource(
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

        return await fetchResource(
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
    const { accessToken, userLogoutHandler } = useUserContext();

    useEffect(() => {
        const abortController = abortRef.current;

        const options = {
            headers: {
                'X-Authorization': accessToken,
            },
        };

        fetchResource(`${baseUrl}/logout`, options)
            .then(() => toast.success('You have been logged out'))
            .finally(userLogoutHandler());

        return () => abortController.abort();
    }, [accessToken, userLogoutHandler]);

    return { isLogout: !!accessToken, loading };
}