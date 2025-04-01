import { useEffect, useState } from "react";
import useCreateResources from "../hooks/useCreateResources";
import { toast } from "react-toastify";
import { useUserContext } from "../contexts/UserContext";
import useGetResources from "../hooks/useGetResources";

const baseUrl = 'http://localhost:3030/data/myComics';

export function useMyComicsId() {
    const {_id} = useUserContext();
    const {fetchResource, loading} = useGetResources();
    const [comicsId, setComicsId] = useState([]);


    useEffect(() => {
        if (!_id) return;

        const options = new URLSearchParams({
            where: `_ownerId="${_id}"`,
            select: 'myComicId',
        });

        fetchResource(`${baseUrl}?${options}`)
            .then(result => setComicsId(result.map(entry => entry.myComicId)  || []))
            .catch(err => toast.error(err.message));

    }, [_id, fetchResource]);
    
    return {comicsId, loading}
}

export function useCreateMyComics() {
    const { fetchResource } = useCreateResources();

    async function create(comicId) {
        return await fetchResource('POST', baseUrl, { myComicId: comicId });
    };
    return { create };
}

