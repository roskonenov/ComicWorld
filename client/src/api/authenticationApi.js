import useCreateResources from "../hooks/useCreateResources";

const baseUrl = 'http://localhost:3030/users';

export function useLogin() {
    const {fetchResource, loading} = useCreateResources();
    
    async function login(email, password) {
       const result = await fetchResource('POST', `${baseUrl}/login`, {email, password});
       return result;
    }
    return {login, loading};
}