import { useContext, useEffect, useState } from "react";
import useGetResources from "../hooks/useGetResources";
import useCreateResources from "../hooks/useCreateResources";
import { UserContext } from "../contexts/UserContext";

const BaseUrl = 'http://localhost:3030/data/comments';

export function useComments(comicId) {
    const [comments, setComments] = useState([]);
    const { fetchResource, loading } = useGetResources();

    useEffect(() => {
        const searchParams = new URLSearchParams({
            where: `comicId="${comicId}"`
        });

        fetchResource(`${BaseUrl}?${searchParams.toString()}`)
            .then(setComments);
    }, [fetchResource, comicId]);

    return { comments, setComments, loading }
}

export function useCreateComment(setComents) {
    const { accessToken } = useContext(UserContext);
    const { fetchResource, loading } = useCreateResources();

    async function create(text, comicId) {
        const options = {
            headers: {
                'X-Authorization': accessToken,
            },
        };
        const result = await fetchResource('POST', BaseUrl, { text, comicId }, options);
        if (result) {
            setComents(c => [...c, result]);
        }
        return result;
    }
    return { create, loading };
}