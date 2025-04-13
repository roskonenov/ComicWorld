import { useEffect, useState } from "react";
import useCreateResources from "../hooks/useCreateResources";
import { toast } from "react-toastify";
import useGetResources from "../hooks/useGetResources";

const baseUrl = `${import.meta.env.VITE_APP_SERVER_URL}/data/myComics`;

export function useMyComicsId(userId) {
    const { fetchResource, loading } = useGetResources();
    const [comicsId, setComicsId] = useState([]);


    useEffect(() => {
        if (!userId) return;

        const options = new URLSearchParams({
            where: `_ownerId="${userId}"`,
            select: 'myComicId',
        });

        fetchResource(`${baseUrl}?${options}`)
            .then(result => setComicsId(result.map(entry => entry.myComicId) || []))
            .catch(err => {
                if (err.code !== 404) {
                    toast.error(err.message)
                }
            });

    }, [userId]);

    return { comicsId, loading }
}

export function useCreateMyComics() {
    const { fetchResource } = useCreateResources();

    async function create(comicId) {
        return await fetchResource('POST', baseUrl, { myComicId: comicId });
    };
    return { create };
}

