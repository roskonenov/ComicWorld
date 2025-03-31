import { useEffect, useState } from "react";
import useGetResources from "../hooks/useGetResources";
import useCreateResources from "../hooks/useCreateResources";
import { useUserContext } from "../contexts/UserContext";

const BaseUrl = 'http://localhost:3030/data/comments';

export function useComments(comicId) {
    const [comments, setComments] = useState([]);
    const { fetchResource, loading } = useGetResources();

    useEffect(() => {
        const searchParams = new URLSearchParams({
            where: `comicId="${comicId}"`,
            load: 'author=_ownerId:users',
        });

        fetchResource(`${BaseUrl}?${searchParams.toString()}`)
            .then(setComments);
    }, [fetchResource, comicId]);

    return { comments, setComments, loading }
}

export function useCreateComment(setComents) {
    const { fetchResource, loading } = useCreateResources();
    const {username} = useUserContext();

    async function create(text, comicId) {
        
        const result = await fetchResource('POST', BaseUrl, { text, comicId });
        if (result) {
            setComents(c => [...c, { ...result, author: {username} }]);
        }
        return result;
    }
    return { create, loading };
}

export function useDeleteComment(setComments){
    const { fetchResource, loading } = useCreateResources();

    async function remove(commentId) {
        
        const result = await fetchResource('DELETE', `${BaseUrl}/${commentId}`);
        if(result._deletedOn){
            setComments(c => c.filter(comment => comment._id !== commentId));
        }
        return result
    }
    return {remove, loading};
}

export function useEditComment(setComments) {
    const { fetchResource, loading } = useCreateResources();
    const {username} = useUserContext();

    async function edit(commentId, text) {
        const result = await fetchResource('PATCH', `${BaseUrl}/${commentId}`, {text} );

        if(result) {
            setComments(prev => prev.map(c => c._id === commentId ? { ...result, author: {username} } : c));
        }
        return result;
    }
    return {edit, loading}; 
}