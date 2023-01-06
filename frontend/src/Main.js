import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios'

const Form = () => {
    const inputRef = useRef(null);
    const addUrl = () => {
        axios.post("/add", {url: inputRef.current.value}).then((res) => alert(res.data))
    }
    return (
        <div className="ui form">
            <div className="ui fluid field">
                <label>Add URL</label>
                <input type="text" ref={inputRef} />
            </div>
            <button className="ui fluid button" onClick={addUrl}>Add URL</button>
        </div>
    )
}

const Delete = (key) => {
    axios.get('/del/' + key).then((res) => alert(res.data))
}

const Table = () => {
    const [urls, setUrls] = useState({});
    useEffect(() => {
        axios.get('/urls').then((res) => setUrls(res.data))
    }, []);
    return (
        <table className="ui table" border="1">
            <tbody>
            { Object.entries(urls).map(([key, url]) => (
                <tr key={key}>
                    <td><a href={url} target="_blank">{url.substr(0,40)}...</a></td>
                    <td><Link to={"/view/" + key}>View</Link></td>
                    <td><button onClick={() => Delete(key)}>Delete</button></td>
                </tr>
            ))}
            </tbody>
        </table>
    );
}

const Main = () => {
    return (
        <div className="ui one column container">
            <div className="column">
                <Form/>
                <Table/>
            </div>
        </div>    
    )
}

export default Main;